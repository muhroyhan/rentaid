package payment

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

type Service struct {
	Pool    *pgxpool.Pool
	Clock   clock.Clock
	Enabled bool
}

func (s *Service) Simulate(ctx context.Context, user, orderID, key, outcome string) (Result, error) {
	if !s.Enabled {
		return Result{}, ErrDisabled
	}
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 128 || (outcome != "succeeded" && outcome != "failed" && outcome != "expired") {
		return Result{}, ErrInvalid
	}
	raw, _ := json.Marshal(struct {
		OrderID string `json:"orderId"`
		Outcome string `json:"outcome"`
	}{orderID, outcome})
	hash := sha256.Sum256(raw)
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Result{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = lockPaymentKey(ctx, tx, user+":payment:"+key); err != nil {
		return Result{}, err
	}
	now := s.Clock.Now().UTC()
	if _, err = deleteExpiredPaymentKey(ctx, tx, user, key, now); err != nil {
		return Result{}, err
	}
	var savedHash, body []byte
	var status int
	err = selectPaymentResult(ctx, tx, user, key, &savedHash, &status, &body)
	if err == nil {
		if string(savedHash) != string(hash[:]) {
			return Result{}, ErrKeyReuse
		}
		return Result{status, body}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Result{}, err
	}
	persist := func(result Result) (Result, error) {
		_, e := savePaymentResult(ctx, tx, user, key, hash[:], result.Status, result.Body, now.Add(24*time.Hour))
		if e != nil {
			return Result{}, e
		}
		if e = tx.Commit(ctx); e != nil {
			return Result{}, e
		}
		return result, nil
	}
	reject := func(status int, code, message, current string) (Result, error) {
		v := map[string]string{"code": code, "message": message}
		if current != "" {
			v["currentStatus"] = current
		}
		b, e := json.Marshal(v)
		if e != nil {
			return Result{}, e
		}
		return persist(Result{status, b})
	}
	var state, orderCode, productName, storeName string
	var hold time.Time
	var amount int64
	err = lockPaymentOrder(ctx, tx, orderID, user, &state, &orderCode, &productName, &storeName, &hold, &amount)
	if errors.Is(err, pgx.ErrNoRows) {
		return reject(404, "not_found", "Pesanan tidak ditemukan.", "")
	}
	if err != nil {
		return Result{}, err
	}
	now = s.Clock.Now().UTC()
	if state != "pending_payment" {
		return reject(409, "order_conflict", "Status pesanan tidak memungkinkan pembayaran.", state)
	}
	late := !now.Before(hold)
	next := map[string]string{"succeeded": "confirmed", "failed": "payment_failed", "expired": "expired"}[outcome]
	if late {
		next = "expired"
	}
	tag, err := setPaymentOrderStatus(ctx, tx, orderID, next)
	if err != nil {
		return Result{}, err
	}
	if tag.RowsAffected() != 1 {
		return Result{}, errors.New("order status changed while locked")
	}
	if _, err = insertPaymentHistory(ctx, tx, orderID, next, user, now); err != nil {
		return Result{}, err
	}
	if late {
		return reject(409, "hold_expired", "Batas waktu pembayaran telah berakhir.", "expired")
	}
	p := Payment{OrderID: orderID, OrderCode: orderCode, ProductName: productName, StoreName: storeName, Amount: amount, Status: outcome, CreatedAt: now}
	err = insertPayment(ctx, tx, orderID, amount, outcome, now, &p.ID)
	if err != nil {
		return Result{}, err
	}
	body, err = json.Marshal(p)
	if err != nil {
		return Result{}, err
	}
	return persist(Result{200, body})
}
func scanPayment(row pgx.Row) (Payment, error) {
	var p Payment
	err := row.Scan(&p.ID, &p.OrderID, &p.OrderCode, &p.ProductName, &p.StoreName, &p.Amount, &p.Status, &p.CreatedAt)
	return p, err
}

func (s *Service) List(ctx context.Context, page, size int) ([]Payment, error) {
	rows, err := listPayments(ctx, s.Pool, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Payment{}
	for rows.Next() {
		p, e := scanPayment(rows)
		if e != nil {
			return nil, e
		}
		items = append(items, p)
	}
	return items, rows.Err()
}
func (s *Service) Get(ctx context.Context, id string) (Payment, error) {
	return scanPayment(selectPayment(ctx, s.Pool, id))
}
func (s *Service) VendorOrders(ctx context.Context, user, status string, page, size int) ([]VendorOrder, error) {
	return s.orders(ctx, user, status, page, size)
}
func (s *Service) AdminOrders(ctx context.Context, status string, page, size int) ([]VendorOrder, error) {
	return s.orders(ctx, nil, status, page, size)
}
func (s *Service) orders(ctx context.Context, user any, status string, page, size int) ([]VendorOrder, error) {
	rows, err := listOrders(ctx, s.Pool, user, status, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []VendorOrder{}
	for rows.Next() {
		var v VendorOrder
		var start, end time.Time
		if err = rows.Scan(&v.ID, &v.OrderCode, &v.ProductName, &v.StoreName, &v.RefundAmount, &v.RenterName, &v.RenterPhone, &start, &end, &v.Quantity, &v.Total, &v.Status, &v.CreatedAt, &v.ReturnedAt); err != nil {
			return nil, err
		}
		v.StartDate = start.Format("2006-01-02")
		v.EndDate = end.Format("2006-01-02")
		items = append(items, v)
	}
	return items, rows.Err()
}
