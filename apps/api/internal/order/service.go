package order

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

var ErrNotFound = errors.New("order not found")
var ErrInvalid = errors.New("invalid expected status")

type Conflict struct{ Status string }

func (e *Conflict) Error() string { return "order status conflict" }

type Cancellation struct {
	ID           string `json:"id"`
	Status       string `json:"status"`
	RefundAmount int64  `json:"refundAmount"`
}
type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

func (s *Service) Cancel(ctx context.Context, id, actor, role, expected string) (Cancellation, error) {
	if expected != "pending_payment" && expected != "confirmed" {
		return Cancellation{}, ErrInvalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Cancellation{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var state, renter, owner string
	var hold time.Time
	err = tx.QueryRow(ctx, `SELECT o.status,o.user_id::text,s.owner_id::text,o.hold_until FROM orders o JOIN products p ON p.id=o.product_id JOIN stores s ON s.id=p.store_id WHERE o.id=$1 FOR UPDATE OF o`, id).Scan(&state, &renter, &owner, &hold)
	if errors.Is(err, pgx.ErrNoRows) {
		return Cancellation{}, ErrNotFound
	}
	if err != nil {
		return Cancellation{}, err
	}
	if role != "admin" && actor != renter && actor != owner {
		return Cancellation{}, ErrNotFound
	}
	refundAmount := int64(0)
	if state == "cancelled" {
		err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT r.amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1),0)`, id).Scan(&refundAmount)
		if err != nil {
			return Cancellation{}, err
		}
		return Cancellation{ID: id, Status: state, RefundAmount: refundAmount}, nil
	}
	now := s.Clock.Now().UTC()
	if state == "pending_payment" && !now.Before(hold) {
		if _, err = tx.Exec(ctx, `UPDATE orders SET status='expired' WHERE id=$1 AND status='pending_payment'`, id); err != nil {
			return Cancellation{}, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,created_at) VALUES($1,'pending_payment','expired',$2)`, id, now); err != nil {
			return Cancellation{}, err
		}
		if err = tx.Commit(ctx); err != nil {
			return Cancellation{}, err
		}
		return Cancellation{}, &Conflict{Status: "expired"}
	}
	if state != expected || (state != "pending_payment" && state != "confirmed") {
		return Cancellation{}, &Conflict{Status: state}
	}
	if state == "confirmed" {
		var paymentID string
		err = tx.QueryRow(ctx, `SELECT id::text,amount FROM payments WHERE order_id=$1 AND status='succeeded' FOR UPDATE`, id).Scan(&paymentID, &refundAmount)
		if err != nil {
			return Cancellation{}, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO refunds(payment_id,amount,status,created_at) VALUES($1,$2,'succeeded',$3)`, paymentID, refundAmount, now); err != nil {
			return Cancellation{}, err
		}
	}
	tag, err := tx.Exec(ctx, `UPDATE orders SET status='cancelled' WHERE id=$1 AND status=$2`, id, state)
	if err != nil {
		return Cancellation{}, err
	}
	if tag.RowsAffected() != 1 {
		return Cancellation{}, errors.New("order changed while locked")
	}
	if _, err = tx.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,actor_id,created_at) VALUES($1,$2,'cancelled',$3,$4)`, id, state, actor, now); err != nil {
		return Cancellation{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Cancellation{}, err
	}
	return Cancellation{ID: id, Status: "cancelled", RefundAmount: refundAmount}, nil
}
func (s *Service) ExpireDue(ctx context.Context) (int64, error) {
	now := s.Clock.Now().UTC()
	tag, err := s.Pool.Exec(ctx, `WITH due AS (SELECT id FROM orders WHERE status='pending_payment' AND hold_until <= $1 ORDER BY hold_until,id LIMIT 200 FOR UPDATE SKIP LOCKED), changed AS (UPDATE orders o SET status='expired' FROM due WHERE o.id=due.id AND o.status='pending_payment' RETURNING o.id) INSERT INTO order_status_history(order_id,from_status,to_status,created_at) SELECT id,'pending_payment','expired',$1 FROM changed`, now)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
