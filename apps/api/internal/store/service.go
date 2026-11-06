package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

func clean(in Input) (Input, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Address = strings.TrimSpace(in.Address)
	in.Phone = strings.TrimSpace(in.Phone)
	if in.Name == "" || in.Address == "" || in.Phone == "" || len(in.Name) > 120 || len(in.Address) > 500 || len(in.Phone) > 40 {
		return Input{}, ErrInvalid
	}
	return in, nil
}
func (s *Service) Create(ctx context.Context, owner string, in Input) (Store, error) {
	in, err := clean(in)
	if err != nil {
		return Store{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Store{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	now := s.Clock.Now().UTC()
	v, err := scan(insertStore(ctx, tx, owner, in.Name, in.Address, in.Phone, now))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Store{}, ErrConflict
	}
	if err != nil {
		return Store{}, err
	}
	if _, err = insertSubmissionHistory(ctx, tx, v.ID, owner, now); err != nil {
		return Store{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Store{}, err
	}
	return v, nil
}
func (s *Service) Own(ctx context.Context, owner string) (Store, error) {
	return scan(selectOwnStore(ctx, s.Pool, owner))
}
func (s *Service) Resubmit(ctx context.Context, owner string, in Input) (Store, error) {
	in, err := clean(in)
	if err != nil {
		return Store{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Store{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, err := scan(lockOwnStore(ctx, tx, owner))
	if err != nil {
		return Store{}, err
	}
	if current.Status != "rejected" {
		return Store{}, ErrConflict
	}
	now := s.Clock.Now().UTC()
	v, err := scan(updateResubmission(ctx, tx, current.ID, in.Name, in.Address, in.Phone, now))
	if err != nil {
		return Store{}, err
	}
	if _, err = insertResubmissionHistory(ctx, tx, v.ID, owner, now); err != nil {
		return Store{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Store{}, err
	}
	return v, nil
}
func (s *Service) List(ctx context.Context, page, size int) ([]Store, error) {
	rows, err := listStores(ctx, s.Pool, size, (page-1)*size)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Store{}
	for rows.Next() {
		item, e := scan(rows)
		if e != nil {
			return nil, e
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) Detail(ctx context.Context, id string) (Detail, error) {
	v, err := scan(selectStore(ctx, s.Pool, id))
	if err != nil {
		return Detail{}, err
	}
	rows, err := listStoreHistory(ctx, s.Pool, id)
	if err != nil {
		return Detail{}, err
	}
	defer rows.Close()
	history := []Decision{}
	for rows.Next() {
		var d Decision
		if err = rows.Scan(&d.ActorID, &d.FromStatus, &d.ToStatus, &d.Reason, &d.CreatedAt); err != nil {
			return Detail{}, err
		}
		history = append(history, d)
	}
	return Detail{Store: v, History: history}, rows.Err()
}
func (s *Service) Decide(ctx context.Context, id, actor, action, reason string) (Store, error) {
	reason = strings.TrimSpace(reason)
	if len(reason) > 1000 || ((action == "reject" || action == "suspend") && reason == "") {
		return Store{}, ErrInvalid
	}
	var from, to string
	switch action {
	case "approve":
		from, to = "pending", "approved"
	case "reject":
		from, to = "pending", "rejected"
	case "suspend":
		from, to = "approved", "suspended"
	case "activate":
		from, to = "suspended", "approved"
	default:
		return Store{}, ErrInvalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Store{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	current, err := scan(lockStore(ctx, tx, id))
	if err != nil {
		return Store{}, err
	}
	if current.Status != from {
		return Store{}, ErrConflict
	}
	now := s.Clock.Now().UTC()
	v, err := scan(setStoreStatus(ctx, tx, id, to, now))
	if err != nil {
		return Store{}, err
	}
	if _, err = insertStoreHistory(ctx, tx, id, actor, from, to, reason, now); err != nil {
		return Store{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Store{}, err
	}
	return v, nil
}

// Approved is the gate for vendor operations that will be introduced with products.
func (s *Service) Approved(ctx context.Context, owner string) (bool, error) {
	v, err := s.Own(ctx, owner)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return v.Status == "approved", nil
}
