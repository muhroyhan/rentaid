package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

var ErrInvalid = errors.New("invalid store")
var ErrNotFound = errors.New("store not found")
var ErrConflict = errors.New("store state conflict")

type Store struct {
	ID        string    `json:"id"`
	OwnerID   string    `json:"ownerId"`
	Name      string    `json:"name"`
	Address   string    `json:"address"`
	Phone     string    `json:"phone"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type Decision struct {
	ActorID    string    `json:"actorId"`
	FromStatus *string   `json:"fromStatus"`
	ToStatus   string    `json:"toStatus"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"createdAt"`
}
type Detail struct {
	Store   Store      `json:"store"`
	History []Decision `json:"history"`
}
type Input struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}
type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

const fields = `id::text,owner_id::text,name,address,phone,status,created_at,updated_at`

type scanner interface{ Scan(...any) error }

func scan(row scanner) (Store, error) {
	var s Store
	err := row.Scan(&s.ID, &s.OwnerID, &s.Name, &s.Address, &s.Phone, &s.Status, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Store{}, ErrNotFound
	}
	return s, err
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
	v, err := scan(tx.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,$2,$3,$4,'pending',$5,$5) RETURNING `+fields, owner, in.Name, in.Address, in.Phone, now))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Store{}, ErrConflict
	}
	if err != nil {
		return Store{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,to_status,created_at) VALUES($1,$2,'pending',$3)`, v.ID, owner, now); err != nil {
		return Store{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Store{}, err
	}
	return v, nil
}
func (s *Service) Own(ctx context.Context, owner string) (Store, error) {
	return scan(s.Pool.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE owner_id=$1`, owner))
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
	current, err := scan(tx.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE owner_id=$1 FOR UPDATE`, owner))
	if err != nil {
		return Store{}, err
	}
	if current.Status != "rejected" {
		return Store{}, ErrConflict
	}
	now := s.Clock.Now().UTC()
	v, err := scan(tx.QueryRow(ctx, `UPDATE stores SET name=$2,address=$3,phone=$4,status='pending',updated_at=$5 WHERE id=$1 RETURNING `+fields, current.ID, in.Name, in.Address, in.Phone, now))
	if err != nil {
		return Store{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,from_status,to_status,created_at) VALUES($1,$2,'rejected','pending',$3)`, v.ID, owner, now); err != nil {
		return Store{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Store{}, err
	}
	return v, nil
}
func (s *Service) List(ctx context.Context, page, size int) ([]Store, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+fields+` FROM stores ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT $1 OFFSET $2`, size, (page-1)*size)
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
	v, err := scan(s.Pool.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE id=$1`, id))
	if err != nil {
		return Detail{}, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT actor_id::text,from_status,to_status,reason,created_at FROM store_status_history WHERE store_id=$1 ORDER BY created_at,id`, id)
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
	current, err := scan(tx.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE id=$1 FOR UPDATE`, id))
	if err != nil {
		return Store{}, err
	}
	if current.Status != from {
		return Store{}, ErrConflict
	}
	now := s.Clock.Now().UTC()
	v, err := scan(tx.QueryRow(ctx, `UPDATE stores SET status=$2,updated_at=$3 WHERE id=$1 RETURNING `+fields, id, to, now))
	if err != nil {
		return Store{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,from_status,to_status,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)`, id, actor, from, to, reason, now); err != nil {
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
