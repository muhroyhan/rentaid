package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func insertStore(ctx context.Context, db database.Executor, owner string, name string, address string, phone string, now time.Time) pgx.Row {
	return db.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,$2,$3,$4,'pending',$5,$5) RETURNING `+fields, owner, name, address, phone, now)
}

func insertSubmissionHistory(ctx context.Context, db database.Executor, id string, owner string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,to_status,created_at) VALUES($1,$2,'pending',$3)`, id, owner, now)
}

func selectOwnStore(ctx context.Context, db database.Executor, owner string) pgx.Row {
	return db.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE owner_id=$1`, owner)
}

func lockOwnStore(ctx context.Context, db database.Executor, owner string) pgx.Row {
	return db.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE owner_id=$1 FOR UPDATE`, owner)
}

func updateResubmission(ctx context.Context, db database.Executor, id string, name string, address string, phone string, now time.Time) pgx.Row {
	return db.QueryRow(ctx, `UPDATE stores SET name=$2,address=$3,phone=$4,status='pending',updated_at=$5 WHERE id=$1 RETURNING `+fields, id, name, address, phone, now)
}

func insertResubmissionHistory(ctx context.Context, db database.Executor, id string, owner string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,from_status,to_status,created_at) VALUES($1,$2,'rejected','pending',$3)`, id, owner, now)
}

func listStores(ctx context.Context, db database.Executor, size int, offset int) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT `+fields+` FROM stores ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT $1 OFFSET $2`, size, offset)
}

func selectStore(ctx context.Context, db database.Executor, id string) pgx.Row {
	return db.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE id=$1`, id)
}

func listStoreHistory(ctx context.Context, db database.Executor, id string) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT actor_id::text,from_status,to_status,reason,created_at FROM store_status_history WHERE store_id=$1 ORDER BY created_at,id`, id)
}

func lockStore(ctx context.Context, db database.Executor, id string) pgx.Row {
	return db.QueryRow(ctx, `SELECT `+fields+` FROM stores WHERE id=$1 FOR UPDATE`, id)
}

func setStoreStatus(ctx context.Context, db database.Executor, id string, to string, now time.Time) pgx.Row {
	return db.QueryRow(ctx, `UPDATE stores SET status=$2,updated_at=$3 WHERE id=$1 RETURNING `+fields, id, to, now)
}

func insertStoreHistory(ctx context.Context, db database.Executor, id string, actor string, from string, to string, reason string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,from_status,to_status,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)`, id, actor, from, to, reason, now)
}

func scan(row scanner) (Store, error) {
	var s Store
	err := row.Scan(&s.ID, &s.OwnerID, &s.Name, &s.Address, &s.Phone, &s.Status, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Store{}, ErrNotFound
	}
	return s, err
}

const fields = `id::text,owner_id::text,name,address,phone,status,created_at,updated_at`

type scanner interface{ Scan(...any) error }
