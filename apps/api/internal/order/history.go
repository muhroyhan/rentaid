package order

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"rentaid.local/api/internal/checkout"
)

type Transaction struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	Amount    int64     `json:"amount"`
	CreatedAt time.Time `json:"createdAt"`
}
type Event struct {
	ID         string    `json:"id"`
	FromStatus *string   `json:"fromStatus"`
	ToStatus   string    `json:"toStatus"`
	ActorName  string    `json:"actorName"`
	ActorRole  string    `json:"actorRole"`
	CreatedAt  time.Time `json:"createdAt"`
}
type Detail struct {
	Order       checkout.Order `json:"order"`
	Payment     *Transaction   `json:"payment,omitempty"`
	Refund      *Transaction   `json:"refund,omitempty"`
	History     []Event        `json:"history"`
	RenterName  string         `json:"renterName,omitempty"`
	RenterPhone string         `json:"renterPhone,omitempty"`
}

func ValidStatus(status string) bool {
	switch status {
	case "", "pending_payment", "confirmed", "renting", "completed", "cancelled", "expired", "payment_failed":
		return true
	}
	return false
}
func (s *Service) ListRenter(ctx context.Context, user, status string, page, size int) ([]checkout.Order, error) {
	rows, err := s.Pool.Query(ctx, `SELECT o.id::text,o.order_code,o.product_id::text,o.product_name,o.store_name,o.store_address,o.start_date,o.end_date,o.quantity,o.daily_price,o.total,COALESCE((SELECT r.amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=o.id),0),o.returned_at,o.status,o.hold_until,o.created_at FROM orders o WHERE o.user_id=$1 AND ($2='' OR o.status=$2) ORDER BY o.created_at DESC,o.id DESC LIMIT $3 OFFSET $4`, user, status, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []checkout.Order{}
	for rows.Next() {
		var o checkout.Order
		var start, end time.Time
		if err = rows.Scan(&o.ID, &o.OrderCode, &o.ProductID, &o.ProductName, &o.StoreName, &o.StoreAddress, &start, &end, &o.Quantity, &o.DailyPrice, &o.Total, &o.RefundAmount, &o.ReturnedAt, &o.Status, &o.HoldUntil, &o.CreatedAt); err != nil {
			return nil, err
		}
		o.StartDate = start.Format("2006-01-02")
		o.EndDate = end.Format("2006-01-02")
		items = append(items, o)
	}
	return items, rows.Err()
}
func (s *Service) Detail(ctx context.Context, id, user, scope string) (Detail, error) {
	if scope != "renter" && scope != "vendor" && scope != "admin" {
		return Detail{}, ErrInvalid
	}
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Detail{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var d Detail
	var start, end time.Time
	var name, phone string
	err = tx.QueryRow(ctx, `SELECT o.id::text,o.order_code,o.product_id::text,o.product_name,o.store_name,o.store_address,o.start_date,o.end_date,o.quantity,o.daily_price,o.total,COALESCE((SELECT r.amount FROM refunds r JOIN payments pay ON pay.id=r.payment_id WHERE pay.order_id=o.id),0),o.returned_at,o.status,o.hold_until,o.created_at,u.name,u.phone FROM orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id JOIN stores st ON st.id=p.store_id WHERE o.id=$1 AND ($3='admin' OR ($3='renter' AND o.user_id=$2::uuid) OR ($3='vendor' AND st.owner_id=$2::uuid))`, id, user, scope).Scan(&d.Order.ID, &d.Order.OrderCode, &d.Order.ProductID, &d.Order.ProductName, &d.Order.StoreName, &d.Order.StoreAddress, &start, &end, &d.Order.Quantity, &d.Order.DailyPrice, &d.Order.Total, &d.Order.RefundAmount, &d.Order.ReturnedAt, &d.Order.Status, &d.Order.HoldUntil, &d.Order.CreatedAt, &name, &phone)
	if errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, ErrNotFound
	}
	if err != nil {
		return Detail{}, err
	}
	d.Order.StartDate = start.Format("2006-01-02")
	d.Order.EndDate = end.Format("2006-01-02")
	if scope != "renter" {
		d.RenterName = name
		d.RenterPhone = phone
	}
	var payment Transaction
	err = tx.QueryRow(ctx, `SELECT id::text,status,amount,created_at FROM payments WHERE order_id=$1`, id).Scan(&payment.ID, &payment.Status, &payment.Amount, &payment.CreatedAt)
	if err == nil {
		d.Payment = &payment
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, err
	}
	var refund Transaction
	err = tx.QueryRow(ctx, `SELECT r.id::text,r.status,r.amount,r.created_at FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1`, id).Scan(&refund.ID, &refund.Status, &refund.Amount, &refund.CreatedAt)
	if err == nil {
		d.Refund = &refund
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, err
	}
	rows, err := tx.Query(ctx, `SELECT h.id::text,h.from_status,h.to_status,CASE WHEN h.actor_id IS NULL THEN 'Sistem' WHEN u.role='admin' THEN 'Admin' ELSE COALESCE(NULLIF(u.name,''),'Pengguna') END,CASE WHEN h.actor_id IS NULL THEN 'system' ELSE u.role END,h.created_at FROM order_status_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.order_id=$1 ORDER BY h.created_at,h.id`, id)
	if err != nil {
		return Detail{}, err
	}
	d.History = []Event{}
	for rows.Next() {
		var e Event
		if err = rows.Scan(&e.ID, &e.FromStatus, &e.ToStatus, &e.ActorName, &e.ActorRole, &e.CreatedAt); err != nil {
			rows.Close()
			return Detail{}, err
		}
		d.History = append(d.History, e)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Detail{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Detail{}, err
	}
	return d, nil
}
