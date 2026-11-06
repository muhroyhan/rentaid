package category

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

func clean(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 120 {
		return "", ErrInvalid
	}
	return name, nil
}
func (s *Service) List(ctx context.Context, page, size int) ([]Category, error) {
	rows, err := listCategories(ctx, s.Pool, size, int64(page-1)*int64(size))
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
	return scan(insertCategory(ctx, s.Pool, name, s.Clock.Now().UTC()))
}
func (s *Service) Update(ctx context.Context, id, name string) (Category, error) {
	name, err := clean(name)
	if err != nil {
		return Category{}, err
	}
	return scan(updateCategory(ctx, s.Pool, id, name, s.Clock.Now().UTC()))
}
func (s *Service) Delete(ctx context.Context, id string) error {
	result, err := deleteCategory(ctx, s.Pool, id)
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
