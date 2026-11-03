package payment

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
	"strings"
	"time"
)

var ErrDisabled = errors.New("simulator disabled")
var ErrInvalid = errors.New("invalid payment")
var ErrKeyReuse = errors.New("key reuse")

type Result struct {
	Status int
	Body   []byte
}
type Payment struct {
	ID          string    `json:"id"`
	OrderID     string    `json:"orderId"`
	OrderCode   string    `json:"orderCode"`
	ProductName string    `json:"productName"`
	StoreName   string    `json:"storeName"`
	Amount      int64     `json:"amount"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}
type VendorOrder struct {
	ID           string    `json:"id"`
	OrderCode    string    `json:"orderCode"`
	ProductName  string    `json:"productName"`
	StoreName    string    `json:"storeName"`
	RefundAmount int64     `json:"refundAmount"`
	RenterName   string    `json:"renterName"`
	RenterPhone  string    `json:"renterPhone"`
	StartDate    string    `json:"startDate"`
	EndDate      string    `json:"endDate"`
	Quantity     int32     `json:"quantity"`
	Total        int64     `json:"total"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"createdAt"`
}
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
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, user+":payment:"+key); err != nil {
		return Result{}, err
	}
	now := s.Clock.Now().UTC()
	if _, err = tx.Exec(ctx, `DELETE FROM idempotency_keys WHERE user_id=$1 AND endpoint='payment' AND key=$2 AND expires_at <= $3`, user, key, now); err != nil {
		return Result{}, err
	}
	var savedHash, body []byte
	var status int
	err = tx.QueryRow(ctx, `SELECT request_hash,response_status,response_body FROM idempotency_keys WHERE user_id=$1 AND endpoint='payment' AND key=$2`, user, key).Scan(&savedHash, &status, &body)
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
		_, e := tx.Exec(ctx, `INSERT INTO idempotency_keys(user_id,endpoint,key,request_hash,response_status,response_body,expires_at) VALUES($1,'payment',$2,$3,$4,$5,$6)`, user, key, hash[:], result.Status, result.Body, now.Add(24*time.Hour))
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
	err = tx.QueryRow(ctx, `SELECT status,order_code,product_name,store_name,hold_until,total FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE`, orderID, user).Scan(&state, &orderCode, &productName, &storeName, &hold, &amount)
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
	tag, err := tx.Exec(ctx, `UPDATE orders SET status=$2 WHERE id=$1 AND status='pending_payment'`, orderID, next)
	if err != nil {
		return Result{}, err
	}
	if tag.RowsAffected() != 1 {
		return Result{}, errors.New("order status changed while locked")
	}
	if _, err = tx.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,actor_id,created_at) VALUES($1,'pending_payment',$2,$3,$4)`, orderID, next, user, now); err != nil {
		return Result{}, err
	}
	if late {
		return reject(409, "hold_expired", "Batas waktu pembayaran telah berakhir.", "expired")
	}
	p := Payment{OrderID: orderID, OrderCode: orderCode, ProductName: productName, StoreName: storeName, Amount: amount, Status: outcome, CreatedAt: now}
	err = tx.QueryRow(ctx, `INSERT INTO payments(order_id,amount,status,created_at) VALUES($1,$2,$3,$4) RETURNING id::text`, orderID, amount, outcome, now).Scan(&p.ID)
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

const paymentSelect = `SELECT p.id::text,p.order_id::text,o.order_code,o.product_name,o.store_name,p.amount,p.status,p.created_at FROM payments p JOIN orders o ON o.id=p.order_id `

func (s *Service) List(ctx context.Context, page, size int) ([]Payment, error) {
	rows, err := s.Pool.Query(ctx, paymentSelect+`ORDER BY p.created_at DESC,p.id DESC LIMIT $1 OFFSET $2`, size, int64(page-1)*int64(size))
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
	return scanPayment(s.Pool.QueryRow(ctx, paymentSelect+`WHERE p.id=$1`, id))
}
func (s *Service) VendorOrders(ctx context.Context, user string, page, size int) ([]VendorOrder, error) {
	return s.orders(ctx, user, page, size)
}
func (s *Service) AdminOrders(ctx context.Context, page, size int) ([]VendorOrder, error) {
	return s.orders(ctx, nil, page, size)
}
func (s *Service) orders(ctx context.Context, user any, page, size int) ([]VendorOrder, error) {
	rows, err := s.Pool.Query(ctx, `SELECT o.id::text,o.order_code,o.product_name,o.store_name,COALESCE((SELECT r.amount FROM refunds r JOIN payments pay ON pay.id=r.payment_id WHERE pay.order_id=o.id),0),u.name,u.phone,o.start_date,o.end_date,o.quantity,o.total,o.status,o.created_at FROM orders o JOIN products p ON p.id=o.product_id JOIN stores s ON s.id=p.store_id JOIN users u ON u.id=o.user_id WHERE ($1::uuid IS NULL OR s.owner_id=$1::uuid) ORDER BY o.created_at DESC,o.id DESC LIMIT $2 OFFSET $3`, user, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []VendorOrder{}
	for rows.Next() {
		var v VendorOrder
		var start, end time.Time
		if err = rows.Scan(&v.ID, &v.OrderCode, &v.ProductName, &v.StoreName, &v.RefundAmount, &v.RenterName, &v.RenterPhone, &start, &end, &v.Quantity, &v.Total, &v.Status, &v.CreatedAt); err != nil {
			return nil, err
		}
		v.StartDate = start.Format("2006-01-02")
		v.EndDate = end.Format("2006-01-02")
		items = append(items, v)
	}
	return items, rows.Err()
}
