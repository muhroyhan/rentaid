package order

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"rentaid.local/api/internal/checkout"
)

func ValidStatus(status string) bool {
	switch status {
	case "", "pending_payment", "confirmed", "renting", "completed", "cancelled", "expired", "payment_failed":
		return true
	}
	return false
}
func (s *Service) ListRenter(ctx context.Context, user, status string, page, size int) ([]checkout.Order, error) {
	rows, err := listRenterOrders(ctx, s.Pool, user, status, size, int64(page-1)*int64(size))
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
	err = selectOrderDetail(ctx, tx, id, user, scope, &d, &start, &end, &name, &phone)
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
	err = selectPayment(ctx, tx, id, &payment)
	if err == nil {
		d.Payment = &payment
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, err
	}
	var refund Transaction
	err = selectRefund(ctx, tx, id, &refund)
	if err == nil {
		d.Refund = &refund
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, err
	}
	rows, err := listOrderHistory(ctx, tx, id)
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
