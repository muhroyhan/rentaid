package checkout

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
	"rentaid.local/api/internal/quote"
)

const HoldDuration = 15 * time.Minute
const keyTTL = 24 * time.Hour

type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

func code() (string, error) {
	b := make([]byte, 5)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "RNT-" + strings.ToUpper(hex.EncodeToString(b)), nil
}
func (s *Service) Create(ctx context.Context, user, key string, in Input) (Result, error) {
	key = strings.TrimSpace(key)
	if len(key) < 1 || len(key) > 128 || in.Quantity < 1 || in.ExpectedTotal < 1 || in.ExpectedAvailable < 0 {
		return Result{}, ErrInvalid
	}
	payload, err := json.Marshal(in)
	if err != nil {
		return Result{}, err
	}
	hash := sha256.Sum256(payload)
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Result{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Serialize the same user/key before checking expiry or inserting a result.
	if _, err = lockCheckoutKey(ctx, tx, user+":checkout:"+key); err != nil {
		return Result{}, err
	}
	now := s.Clock.Now().UTC()
	if _, err = deleteExpiredCheckoutKey(ctx, tx, user, key, now); err != nil {
		return Result{}, err
	}
	var savedHash, body []byte
	var status int
	err = selectCheckoutResult(ctx, tx, user, key, &savedHash, &status, &body)
	if err == nil {
		if !equal(savedHash, hash[:]) {
			return Result{}, ErrKeyReuse
		}
		return Result{status, body}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Result{}, err
	}
	persist := func(result Result) (Result, error) {
		_, e := saveCheckoutResult(ctx, tx, user, key, hash[:], result.Status, result.Body, now.Add(keyTTL))
		if e != nil {
			return Result{}, e
		}
		if e = tx.Commit(ctx); e != nil {
			return Result{}, e
		}
		return result, nil
	}
	reject := func(status int, code, message string) (Result, error) {
		body, e := json.Marshal(map[string]string{"code": code, "message": message})
		if e != nil {
			return Result{}, e
		}
		return persist(Result{status, body})
	}
	if _, _, _, err = quote.Dates(in.StartDate, in.EndDate, now); err != nil {
		return reject(400, "invalid_checkout", "Data checkout tidak valid.")
	}
	var phone string
	if err = selectRenterPhone(ctx, tx, user, &phone); errors.Is(err, pgx.ErrNoRows) {
		return reject(404, "not_found", "Produk tidak ditemukan.")
	} else if err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(phone) == "" {
		return reject(400, "phone_required", "Lengkapi nomor telepon pada profil sebelum checkout.")
	}
	// Lock the store first, matching vendor product updates and store moderation.
	var owner, storeName, address, storeStatus string
	err = lockCheckoutStore(ctx, tx, in.ProductID, &owner, &storeName, &address, &storeStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return reject(404, "not_found", "Produk tidak ditemukan.")
	}
	if err != nil {
		return Result{}, err
	}
	if owner == user {
		return reject(403, "own_product", "Anda tidak dapat menyewa produk toko sendiri.")
	}
	if storeStatus != "approved" {
		return reject(404, "not_found", "Produk tidak ditemukan.")
	}
	var name string
	var price int64
	var stock int32
	var published, archived, hidden bool
	err = lockCheckoutProduct(ctx, tx, in.ProductID, &name, &price, &stock, &published, &archived, &hidden)
	if errors.Is(err, pgx.ErrNoRows) {
		return reject(404, "not_found", "Produk tidak ditemukan.")
	}
	if err != nil {
		return Result{}, err
	}
	if !published || archived || hidden {
		return reject(404, "not_found", "Produk tidak ditemukan.")
	}
	// Capture time after acquiring the lock so expired holds never remain active while waiting.
	now = s.Clock.Now().UTC()
	a, b, days, err := quote.Dates(in.StartDate, in.EndDate, now)
	if err != nil {
		return reject(400, "invalid_checkout", "Data checkout tidak valid.")
	}
	var used int64
	err = selectPeakUsage(ctx, tx, in.ProductID, a, b, now, &used)
	if err != nil {
		return Result{}, err
	}
	available := int64(stock) - used
	if available < 0 {
		available = 0
	}
	factor := int64(days) * int64(in.Quantity)
	if price > 9007199254740991/factor {
		return reject(400, "invalid_checkout", "Data checkout tidak valid.")
	}
	total := price * factor
	current := quote.Quote{ProductID: in.ProductID, StartDate: in.StartDate, EndDate: in.EndDate, Days: days, Quantity: in.Quantity, DailyPrice: price, Available: int32(available), Total: total}
	var result Result
	if in.ExpectedTotal != total || int64(in.ExpectedAvailable) != available || int64(in.Quantity) > available {
		result.Status = 409
		result.Body, err = json.Marshal(map[string]any{"code": "quote_changed", "message": "Harga atau ketersediaan berubah. Periksa penawaran terbaru.", "quote": current})
	} else {
		orderCode, e := code()
		if e != nil {
			return Result{}, e
		}
		order := Order{OrderCode: orderCode, ProductID: in.ProductID, ProductName: name, StoreName: storeName, StoreAddress: address, StartDate: in.StartDate, EndDate: in.EndDate, Quantity: in.Quantity, DailyPrice: price, Total: total, Status: "pending_payment", HoldUntil: now.Add(HoldDuration), CreatedAt: now}
		err = insertCheckoutOrder(ctx, tx, in.ProductID, user, orderCode, name, storeName, address, a, b, in.Quantity, price, total, order.HoldUntil, now, &order.ID)
		if err != nil {
			return Result{}, err
		}
		if _, err = insertCheckoutHistory(ctx, tx, order.ID, user, now); err != nil {
			return Result{}, err
		}
		result.Status = 201
		result.Body, err = json.Marshal(order)
	}
	if err != nil {
		return Result{}, err
	}
	return persist(result)
}
func equal(a, b []byte) bool { return string(a) == string(b) }
func (s *Service) Get(ctx context.Context, user, id string) (Order, error) {
	var o Order
	var a, b time.Time
	err := selectRenterOrder(ctx, s.Pool, id, user, &o, &a, &b)
	if errors.Is(err, pgx.ErrNoRows) {
		return Order{}, ErrNotFound
	}
	if err != nil {
		return Order{}, fmt.Errorf("get order: %w", err)
	}
	o.StartDate = a.Format("2006-01-02")
	o.EndDate = b.Format("2006-01-02")
	return o, nil
}
