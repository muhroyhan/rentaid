package order

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

func (e *Conflict) Error() string { return "order status conflict" }

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
	err = lockOrderForCancellation(ctx, tx, id, &state, &renter, &owner, &hold)
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
		err = selectRefundAmount(ctx, tx, id, &refundAmount)
		if err != nil {
			return Cancellation{}, err
		}
		return Cancellation{ID: id, Status: state, RefundAmount: refundAmount}, nil
	}
	now := s.Clock.Now().UTC()
	if state == "pending_payment" && !now.Before(hold) {
		if _, err = expireOrder(ctx, tx, id); err != nil {
			return Cancellation{}, err
		}
		if _, err = insertExpirationHistory(ctx, tx, id, now); err != nil {
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
		err = selectSuccessfulPayment(ctx, tx, id, &paymentID, &refundAmount)
		if err != nil {
			return Cancellation{}, err
		}
		if _, err = insertRefund(ctx, tx, paymentID, refundAmount, now); err != nil {
			return Cancellation{}, err
		}
	}
	tag, err := cancelOrder(ctx, tx, id, state)
	if err != nil {
		return Cancellation{}, err
	}
	if tag.RowsAffected() != 1 {
		return Cancellation{}, errors.New("order changed while locked")
	}
	if _, err = insertCancellationHistory(ctx, tx, id, state, actor, now); err != nil {
		return Cancellation{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Cancellation{}, err
	}
	return Cancellation{ID: id, Status: "cancelled", RefundAmount: refundAmount}, nil
}
func (s *Service) ExpireDue(ctx context.Context) (int64, error) {
	now := s.Clock.Now().UTC()
	tag, err := expireDueOrders(ctx, s.Pool, now)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// Handover allows only the owning vendor to mark a confirmed order as renting.
func (s *Service) Handover(ctx context.Context, id, actor string) (string, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var state string
	var start, end time.Time
	err = lockOrderForHandover(ctx, tx, id, actor, &state, &start, &end)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if state == "renting" {
		return state, nil
	}
	if state == "completed" {
		var handed bool
		err = hasHandoverHistory(ctx, tx, id, &handed)
		if err != nil {
			return "", err
		}
		if handed {
			return state, nil
		}
	}
	if state != "confirmed" {
		return "", &Conflict{Status: state}
	}
	now := s.Clock.Now().UTC()
	loc, err := clock.Jakarta()
	if err != nil {
		return "", err
	}
	today := now.In(loc).Format("2006-01-02")
	if today < start.Format("2006-01-02") || today > end.Format("2006-01-02") {
		return "", ErrOutsideWindow
	}
	tag, err := markRenting(ctx, tx, id)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() != 1 {
		return "", errors.New("order changed while locked")
	}
	if _, err = insertHandoverHistory(ctx, tx, id, actor, now); err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return "renting", nil
}

// Return records the vendor's confirmation without changing the reserved rental dates.
func (s *Service) Return(ctx context.Context, id, actor string) (time.Time, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return time.Time{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var state string
	var returned *time.Time
	err = lockOrderForReturn(ctx, tx, id, actor, &state, &returned)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, ErrNotFound
	}
	if err != nil {
		return time.Time{}, err
	}
	if state == "completed" && returned != nil {
		return *returned, nil
	}
	if state != "renting" {
		return time.Time{}, &Conflict{Status: state}
	}
	now := s.Clock.Now().UTC()
	var saved time.Time
	err = markCompleted(ctx, tx, id, now, &saved)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, errors.New("order changed while locked")
	}
	if err != nil {
		return time.Time{}, err
	}
	if _, err = insertReturnHistory(ctx, tx, id, actor, saved); err != nil {
		return time.Time{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return time.Time{}, err
	}
	return saved, nil
}
