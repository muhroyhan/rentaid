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

var ErrInvalid = errors.New("invalid checkout")
var ErrPhone = errors.New("phone required")
var ErrOwnProduct = errors.New("own product")
var ErrNotFound = errors.New("not found")
var ErrKeyReuse = errors.New("idempotency key reused")

type Input struct {
	ProductID         string `json:"productId"`
	StartDate         string `json:"startDate"`
	EndDate           string `json:"endDate"`
	Quantity          int32  `json:"quantity"`
	ExpectedTotal     int64  `json:"expectedTotal"`
	ExpectedAvailable int32  `json:"expectedAvailable"`
}
type Order struct {
	ID           string    `json:"id"`
	OrderCode    string    `json:"orderCode"`
	ProductID    string    `json:"productId"`
	ProductName  string    `json:"productName"`
	StoreName    string    `json:"storeName"`
	StoreAddress string    `json:"storeAddress"`
	StartDate    string    `json:"startDate"`
	EndDate      string    `json:"endDate"`
	Quantity     int32     `json:"quantity"`
	DailyPrice   int64     `json:"dailyPrice"`
	Total        int64     `json:"total"`
	RefundAmount int64     `json:"refundAmount"`
	Status       string    `json:"status"`
	HoldUntil    time.Time `json:"holdUntil"`
	CreatedAt    time.Time `json:"createdAt"`
}
type Result struct {
	Status int
	Body   []byte
}
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
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, user+":checkout:"+key); err != nil {
		return Result{}, err
	}
	now := s.Clock.Now().UTC()
	if _, err = tx.Exec(ctx, `DELETE FROM idempotency_keys WHERE user_id=$1 AND endpoint='checkout' AND key=$2 AND expires_at <= $3`, user, key, now); err != nil {
		return Result{}, err
	}
	var savedHash, body []byte
	var status int
	err = tx.QueryRow(ctx, `SELECT request_hash,response_status,response_body FROM idempotency_keys WHERE user_id=$1 AND endpoint='checkout' AND key=$2`, user, key).Scan(&savedHash, &status, &body)
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
		_, e := tx.Exec(ctx, `INSERT INTO idempotency_keys(user_id,endpoint,key,request_hash,response_status,response_body,expires_at) VALUES($1,'checkout',$2,$3,$4,$5,$6)`, user, key, hash[:], result.Status, result.Body, now.Add(keyTTL))
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
	if err = tx.QueryRow(ctx, `SELECT phone FROM users WHERE id=$1 AND role='user' AND status='active'`, user).Scan(&phone); errors.Is(err, pgx.ErrNoRows) {
		return reject(404, "not_found", "Produk tidak ditemukan.")
	} else if err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(phone) == "" {
		return reject(400, "phone_required", "Lengkapi nomor telepon pada profil sebelum checkout.")
	}
	// Lock the store first, matching vendor product updates and store moderation.
	var owner, storeName, address, storeStatus string
	err = tx.QueryRow(ctx, `SELECT s.owner_id::text,s.name,s.address,s.status FROM stores s JOIN products p ON p.store_id=s.id WHERE p.id=$1 FOR SHARE OF s`, in.ProductID).Scan(&owner, &storeName, &address, &storeStatus)
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
	err = tx.QueryRow(ctx, `SELECT name,daily_price,stock,published,archived,hidden FROM products WHERE id=$1 FOR UPDATE`, in.ProductID).Scan(&name, &price, &stock, &published, &archived, &hidden)
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
	err = tx.QueryRow(ctx, `SELECT COALESCE(MAX(used),0) FROM (SELECT d.day,COALESCE(SUM(o.quantity),0) AS used FROM generate_series($2::date::timestamp,$3::date::timestamp,interval '1 day') d(day) LEFT JOIN orders o ON o.product_id=$1 AND o.start_date<=d.day::date AND o.end_date>=d.day::date AND (o.status IN ('confirmed','renting') OR (o.status='pending_payment' AND o.hold_until>$4)) GROUP BY d.day) usage`, in.ProductID, a, b, now).Scan(&used)
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
		err = tx.QueryRow(ctx, `INSERT INTO orders(product_id,user_id,order_code,product_name,store_name,store_address,start_date,end_date,quantity,daily_price,total,status,hold_until,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_payment',$12,$13) RETURNING id::text`, in.ProductID, user, orderCode, name, storeName, address, a, b, in.Quantity, price, total, order.HoldUntil, now).Scan(&order.ID)
		if err != nil {
			return Result{}, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO order_status_history(order_id,to_status,actor_id,created_at) VALUES($1,'pending_payment',$2,$3)`, order.ID, user, now); err != nil {
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
	err := s.Pool.QueryRow(ctx, `SELECT id::text,order_code,product_id::text,product_name,store_name,store_address,start_date,end_date,quantity,daily_price,total,status,hold_until,created_at,COALESCE((SELECT r.amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=orders.id),0) FROM orders WHERE id=$1 AND user_id=$2`, id, user).Scan(&o.ID, &o.OrderCode, &o.ProductID, &o.ProductName, &o.StoreName, &o.StoreAddress, &a, &b, &o.Quantity, &o.DailyPrice, &o.Total, &o.Status, &o.HoldUntil, &o.CreatedAt, &o.RefundAmount)
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
