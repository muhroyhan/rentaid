package category

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

var ErrInvalid = errors.New("invalid category")
var ErrNotFound = errors.New("category not found")
var ErrInUse = errors.New("category is in use")

type Category struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}
type scanner interface{ Scan(...any) error }

func scan(row scanner) (Category, error) {
	var c Category
	err := row.Scan(&c.ID, &c.Name, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Category{}, ErrNotFound
	}
	return c, err
}
func clean(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 120 {
		return "", ErrInvalid
	}
	return name, nil
}
func (s *Service) List(ctx context.Context, page, size int) ([]Category, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id::text,name,created_at,updated_at FROM categories ORDER BY name,id LIMIT $1 OFFSET $2`, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Category{}
	for rows.Next() {
		v, e := scan(rows)
		if e != nil {
			return nil, e
		}
		items = append(items, v)
	}
	return items, rows.Err()
}
func (s *Service) Create(ctx context.Context, name string) (Category, error) {
	name, err := clean(name)
	if err != nil {
		return Category{}, err
	}
	return scan(s.Pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES($1,$2,$2) RETURNING id::text,name,created_at,updated_at`, name, s.Clock.Now().UTC()))
}
func (s *Service) Update(ctx context.Context, id, name string) (Category, error) {
	name, err := clean(name)
	if err != nil {
		return Category{}, err
	}
	return scan(s.Pool.QueryRow(ctx, `UPDATE categories SET name=$2,updated_at=$3 WHERE id=$1 RETURNING id::text,name,created_at,updated_at`, id, name, s.Clock.Now().UTC()))
}
func (s *Service) Delete(ctx context.Context, id string) error {
	result, err := s.Pool.Exec(ctx, `DELETE FROM categories WHERE id=$1`, id)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && (pgErr.Code == "23503" || pgErr.Code == "23001") {
		return ErrInUse
	}
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
