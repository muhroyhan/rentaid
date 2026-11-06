package category

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func listCategories(ctx context.Context, db database.Executor, size int, offset int64) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT id::text,name,created_at,updated_at FROM categories ORDER BY name,id LIMIT $1 OFFSET $2`, size, offset)
}

func insertCategory(ctx context.Context, db database.Executor, name string, offset time.Time) pgx.Row {
	return db.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES($1,$2,$2) RETURNING id::text,name,created_at,updated_at`, name, offset)
}

func updateCategory(ctx context.Context, db database.Executor, id string, name string, now time.Time) pgx.Row {
	return db.QueryRow(ctx, `UPDATE categories SET name=$2,updated_at=$3 WHERE id=$1 RETURNING id::text,name,created_at,updated_at`, id, name, now)
}

func deleteCategory(ctx context.Context, db database.Executor, id string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `DELETE FROM categories WHERE id=$1`, id)
}

func scan(row scanner) (Category, error) {
	var c Category
	err := row.Scan(&c.ID, &c.Name, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Category{}, ErrNotFound
	}
	return c, err
}

type scanner interface{ Scan(...any) error }
