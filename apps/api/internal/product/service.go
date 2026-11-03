package product

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

var ErrInvalid = errors.New("invalid product")
var ErrNotFound = errors.New("product not found")
var ErrForbidden = errors.New("store not approved")
var ErrConflict = errors.New("product conflict")

type Product struct {
	ID           string    `json:"id"`
	StoreID      string    `json:"storeId"`
	StoreName    string    `json:"storeName"`
	StoreAddress string    `json:"storeAddress"`
	CategoryID   string    `json:"categoryId"`
	CategoryName string    `json:"categoryName"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DailyPrice   int64     `json:"dailyPrice"`
	Stock        int32     `json:"stock"`
	Published    bool      `json:"published"`
	Archived     bool      `json:"archived"`
	Hidden       bool      `json:"hidden"`
	PhotoIDs     []string  `json:"photoIds"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
type Input struct {
	CategoryID  string   `json:"categoryId"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	DailyPrice  int64    `json:"dailyPrice"`
	Stock       int32    `json:"stock"`
	PhotoIDs    []string `json:"photoIds"`
}
type Decision struct {
	ActorID   string    `json:"actorId"`
	Hidden    bool      `json:"hidden"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"createdAt"`
}
type Detail struct {
	Product Product    `json:"product"`
	History []Decision `json:"history"`
}
type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

const fields = `p.id::text,p.store_id::text,s.name,s.address,p.category_id::text,c.name,p.name,p.description,p.daily_price,p.stock,p.published,p.archived,p.hidden,ARRAY(SELECT media_id::text FROM product_photos WHERE product_id=p.id ORDER BY position),p.created_at,p.updated_at`
const joins = ` FROM products p JOIN stores s ON s.id=p.store_id JOIN categories c ON c.id=p.category_id `

type scanner interface{ Scan(...any) error }

func scan(row scanner) (Product, error) {
	var p Product
	err := row.Scan(&p.ID, &p.StoreID, &p.StoreName, &p.StoreAddress, &p.CategoryID, &p.CategoryName, &p.Name, &p.Description, &p.DailyPrice, &p.Stock, &p.Published, &p.Archived, &p.Hidden, &p.PhotoIDs, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, ErrNotFound
	}
	return p, err
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
func dbError(err error) error {
	var e *pgconn.PgError
	if errors.As(err, &e) && (e.Code == "23503" || e.Code == "22P02") {
		return ErrInvalid
	}
	return err
}
func lockApproved(ctx context.Context, tx pgx.Tx, owner string) (string, error) {
	var id, status string
	err := tx.QueryRow(ctx, `SELECT id::text,status FROM stores WHERE owner_id=$1 FOR UPDATE`, owner).Scan(&id, &status)
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
func find(ctx context.Context, tx pgx.Tx, id string) (Product, error) {
	return scan(tx.QueryRow(ctx, `SELECT `+fields+joins+` WHERE p.id=$1`, id))
}
func setPhotos(ctx context.Context, tx pgx.Tx, id, owner string, photos []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM product_photos WHERE product_id=$1`, id); err != nil {
		return err
	}
	for i, photo := range photos {
		var ok bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM media WHERE id::text=$1 AND owner_id::text=$2)`, photo, owner).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return ErrInvalid
		}
		if _, err := tx.Exec(ctx, `INSERT INTO product_photos(product_id,media_id,position) VALUES($1,$2,$3)`, id, photo, i); err != nil {
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
	err = tx.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id::text`, store, in.CategoryID, in.Name, in.Description, in.DailyPrice, in.Stock, now).Scan(&id)
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
	err = tx.QueryRow(ctx, `SELECT stock FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE`, id, store).Scan(&currentStock)
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
		err = tx.QueryRow(ctx, `SELECT COALESCE(MAX((SELECT COALESCE(SUM(o.quantity),0) FROM orders o WHERE o.product_id=$1 AND o.start_date<=d.day AND o.end_date>=d.day AND (o.status IN ('confirmed','renting','completed') OR (o.status='pending_payment' AND o.hold_until>$3)))),0) FROM (SELECT $2::date AS day UNION SELECT start_date FROM orders WHERE product_id=$1 AND start_date >= $2::date AND (status IN ('confirmed','renting','completed') OR (status='pending_payment' AND hold_until>$3))) d`, id, today, now).Scan(&peak)
		if err != nil {
			return Product{}, err
		}
		if int64(in.Stock) < peak {
			return Product{}, ErrConflict
		}
	}
	result, err := tx.Exec(ctx, `UPDATE products SET category_id=$3,name=$4,description=$5,daily_price=$6,stock=$7,updated_at=$8 WHERE id=$1 AND store_id=$2`, id, store, in.CategoryID, in.Name, in.Description, in.DailyPrice, in.Stock, s.Clock.Now().UTC())
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
	err = tx.QueryRow(ctx, `SELECT archived FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE`, id, store).Scan(&archived)
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
		_, err = tx.Exec(ctx, `UPDATE products SET published=$2,updated_at=$3 WHERE id=$1`, id, value, s.Clock.Now().UTC())
	case "archive":
		_, err = tx.Exec(ctx, `UPDATE products SET archived=$2,published=CASE WHEN $2 THEN false ELSE published END,updated_at=$3 WHERE id=$1`, id, value, s.Clock.Now().UTC())
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
	query := `SELECT ` + fields + joins
	args := []any{}
	switch scope {
	case "public":
		query += ` WHERE p.published AND NOT p.archived AND NOT p.hidden AND s.status='approved'`
	case "vendor":
		query += ` WHERE s.owner_id=$1`
		args = append(args, owner)
	case "admin":
	default:
		return nil, ErrInvalid
	}
	if scope == "public" && strings.TrimSpace(search) != "" {
		args = append(args, strings.TrimSpace(search))
		query += fmt.Sprintf(` AND strpos(lower(p.name || ' ' || p.description), lower($%d)) > 0`, len(args))
	}
	if scope == "public" && categoryID != "" {
		args = append(args, categoryID)
		query += fmt.Sprintf(` AND p.category_id=$%d`, len(args))
	}
	query += fmt.Sprintf(` ORDER BY p.created_at DESC,p.id DESC LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2)
	args = append(args, size, int64(page-1)*int64(size))
	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Product{}
	for rows.Next() {
		v, e := scan(rows)
		if e != nil {
			return nil, e
		}
		items = append(items, v)
	}
	return items, rows.Err()
}
func (s *Service) Get(ctx context.Context, id, scope, owner string) (Product, error) {
	query := `SELECT ` + fields + joins + ` WHERE p.id=$1`
	args := []any{id}
	switch scope {
	case "public":
		query += ` AND p.published AND NOT p.archived AND NOT p.hidden AND s.status='approved'`
	case "vendor":
		query += ` AND s.owner_id=$2`
		args = append(args, owner)
	case "admin":
	default:
		return Product{}, ErrInvalid
	}
	return scan(s.Pool.QueryRow(ctx, query, args...))
}
func (s *Service) Detail(ctx context.Context, id string) (Detail, error) {
	p, err := s.Get(ctx, id, "admin", "")
	if err != nil {
		return Detail{}, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT actor_id::text,hidden,reason,created_at FROM product_moderation_history WHERE product_id=$1 ORDER BY created_at,id`, id)
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
	err = tx.QueryRow(ctx, `SELECT hidden FROM products WHERE id=$1 FOR UPDATE`, id).Scan(&current)
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
	if _, err = tx.Exec(ctx, `UPDATE products SET hidden=$2,updated_at=$3 WHERE id=$1`, id, hidden, now); err != nil {
		return Product{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO product_moderation_history(product_id,actor_id,hidden,reason,created_at) VALUES($1,$2,$3,$4,$5)`, id, actor, hidden, reason, now); err != nil {
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
