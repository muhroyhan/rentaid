package product

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

func clean(in Input) (Input, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 200 || in.Description == "" || utf8.RuneCountInString(in.Description) > 10000 || in.CategoryID == "" || in.DailyPrice <= 0 || in.Stock < 0 || len(in.PhotoIDs) > 10 {
		return Input{}, ErrInvalid
	}
	seen := map[string]bool{}
	for _, id := range in.PhotoIDs {
		if id == "" || seen[id] {
			return Input{}, ErrInvalid
		}
		seen[id] = true
	}
	return in, nil
}

func lockApproved(ctx context.Context, tx pgx.Tx, owner string) (string, error) {
	var id, status string
	err := lockVendorStore(ctx, tx, owner, &id, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrForbidden
	}
	if err != nil {
		return "", err
	}
	if status != "approved" {
		return "", ErrForbidden
	}
	return id, nil
}

func setPhotos(ctx context.Context, tx pgx.Tx, id, owner string, photos []string) error {
	if _, err := deleteProductPhotos(ctx, tx, id); err != nil {
		return err
	}
	for i, photo := range photos {
		var ok bool
		if err := hasOwnedMedia(ctx, tx, photo, owner, &ok); err != nil {
			return err
		}
		if !ok {
			return ErrInvalid
		}
		if _, err := insertProductPhoto(ctx, tx, id, photo, i); err != nil {
			return dbError(err)
		}
	}
	return nil
}
func (s *Service) Create(ctx context.Context, owner string, in Input) (Product, error) {
	in, err := clean(in)
	if err != nil {
		return Product{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	store, err := lockApproved(ctx, tx, owner)
	if err != nil {
		return Product{}, err
	}
	var id string
	now := s.Clock.Now().UTC()
	err = insertProduct(ctx, tx, store, in.CategoryID, in.Name, in.Description, in.DailyPrice, in.Stock, now, &id)
	if err != nil {
		return Product{}, dbError(err)
	}
	if err = setPhotos(ctx, tx, id, owner, in.PhotoIDs); err != nil {
		return Product{}, err
	}
	v, err := find(ctx, tx, id)
	if err != nil {
		return Product{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Product{}, err
	}
	return v, nil
}
func (s *Service) Update(ctx context.Context, owner, id string, in Input) (Product, error) {
	in, err := clean(in)
	if err != nil {
		return Product{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	store, err := lockApproved(ctx, tx, owner)
	if err != nil {
		return Product{}, err
	}
	var currentStock int32
	err = lockProductStock(ctx, tx, id, store, &currentStock)
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, ErrNotFound
	}
	if err != nil {
		return Product{}, err
	}
	if in.Stock < currentStock {
		now := s.Clock.Now().UTC()
		loc, e := clock.Jakarta()
		if e != nil {
			return Product{}, e
		}
		today := now.In(loc).Format("2006-01-02")
		var peak int64
		err = selectPeakUsage(ctx, tx, id, today, now, &peak)
		if err != nil {
			return Product{}, err
		}
		if int64(in.Stock) < peak {
			return Product{}, ErrConflict
		}
	}
	result, err := updateProduct(ctx, tx, id, store, in.CategoryID, in.Name, in.Description, in.DailyPrice, in.Stock, s.Clock.Now().UTC())
	if err != nil {
		return Product{}, dbError(err)
	}
	if result.RowsAffected() == 0 {
		return Product{}, ErrNotFound
	}
	if err = setPhotos(ctx, tx, id, owner, in.PhotoIDs); err != nil {
		return Product{}, err
	}
	v, err := find(ctx, tx, id)
	if err != nil {
		return Product{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Product{}, err
	}
	return v, nil
}
func (s *Service) ChangeState(ctx context.Context, owner, id, action string, value bool) (Product, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	store, err := lockApproved(ctx, tx, owner)
	if err != nil {
		return Product{}, err
	}
	var archived bool
	err = lockProductState(ctx, tx, id, store, &archived)
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, ErrNotFound
	}
	if err != nil {
		return Product{}, err
	}
	switch action {
	case "publish":
		if value && archived {
			return Product{}, ErrConflict
		}
		_, err = setPublication(ctx, tx, id, value, s.Clock.Now().UTC())
	case "archive":
		_, err = setArchive(ctx, tx, id, value, s.Clock.Now().UTC())
	default:
		return Product{}, ErrInvalid
	}
	if err != nil {
		return Product{}, err
	}
	v, err := find(ctx, tx, id)
	if err != nil {
		return Product{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Product{}, err
	}
	return v, nil
}
func (s *Service) List(ctx context.Context, scope, owner, search, categoryID string, page, size int) ([]Product, error) {
	return listProducts(ctx, s.Pool, scope, owner, search, categoryID, page, size)
}
func (s *Service) Get(ctx context.Context, id, scope, owner string) (Product, error) {
	return getProduct(ctx, s.Pool, id, scope, owner)
}
func (s *Service) Detail(ctx context.Context, id string) (Detail, error) {
	p, err := s.Get(ctx, id, "admin", "")
	if err != nil {
		return Detail{}, err
	}
	rows, err := listModerationHistory(ctx, s.Pool, id)
	if err != nil {
		return Detail{}, err
	}
	defer rows.Close()
	items := []Decision{}
	for rows.Next() {
		var d Decision
		if err = rows.Scan(&d.ActorID, &d.Hidden, &d.Reason, &d.CreatedAt); err != nil {
			return Detail{}, err
		}
		items = append(items, d)
	}
	return Detail{Product: p, History: items}, rows.Err()
}
func (s *Service) Moderate(ctx context.Context, id, actor string, hidden bool, reason string) (Product, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" || utf8.RuneCountInString(reason) > 1000 {
		return Product{}, ErrInvalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var current bool
	err = lockModerationState(ctx, tx, id, &current)
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, ErrNotFound
	}
	if err != nil {
		return Product{}, err
	}
	if current == hidden {
		return Product{}, ErrConflict
	}
	now := s.Clock.Now().UTC()
	if _, err = setModeration(ctx, tx, id, hidden, now); err != nil {
		return Product{}, err
	}
	if _, err = insertModerationHistory(ctx, tx, id, actor, hidden, reason, now); err != nil {
		return Product{}, err
	}
	v, err := find(ctx, tx, id)
	if err != nil {
		return Product{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Product{}, err
	}
	return v, nil
}
