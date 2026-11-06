package product

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func lockVendorStore(ctx context.Context, db database.Executor, owner string, outID *string, outStatus *string) error {
	return db.QueryRow(ctx, `SELECT id::text,status FROM stores WHERE owner_id=$1 FOR UPDATE`, owner).Scan(outID, outStatus)
}

func selectProduct(ctx context.Context, db database.Executor, id string) pgx.Row {
	return db.QueryRow(ctx, `SELECT `+fields+joins+` WHERE p.id=$1`, id)
}

func deleteProductPhotos(ctx context.Context, db database.Executor, id string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `DELETE FROM product_photos WHERE product_id=$1`, id)
}

func hasOwnedMedia(ctx context.Context, db database.Executor, photo string, owner string, outExists *bool) error {
	return db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM media WHERE id::text=$1 AND owner_id::text=$2)`, photo, owner).Scan(outExists)
}

func insertProductPhoto(ctx context.Context, db database.Executor, id string, photo string, i int) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO product_photos(product_id,media_id,position) VALUES($1,$2,$3)`, id, photo, i)
}

func insertProduct(ctx context.Context, db database.Executor, store string, categoryID string, name string, description string, dailyPrice int64, stock int32, now time.Time, outID *string) error {
	return db.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id::text`, store, categoryID, name, description, dailyPrice, stock, now).Scan(outID)
}

func lockProductStock(ctx context.Context, db database.Executor, id string, store string, outCurrentStock *int32) error {
	return db.QueryRow(ctx, `SELECT stock FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE`, id, store).Scan(outCurrentStock)
}

func selectPeakUsage(ctx context.Context, db database.Executor, id string, today string, now time.Time, outPeak *int64) error {
	return db.QueryRow(ctx, `SELECT COALESCE(MAX((SELECT COALESCE(SUM(o.quantity),0) FROM orders o WHERE o.product_id=$1 AND o.start_date<=d.day AND o.end_date>=d.day AND (o.status IN ('confirmed','renting','completed') OR (o.status='pending_payment' AND o.hold_until>$3)))),0) FROM (SELECT $2::date AS day UNION SELECT start_date FROM orders WHERE product_id=$1 AND start_date >= $2::date AND (status IN ('confirmed','renting','completed') OR (status='pending_payment' AND hold_until>$3))) d`, id, today, now).Scan(outPeak)
}

func updateProduct(ctx context.Context, db database.Executor, id string, store string, categoryID string, name string, description string, dailyPrice int64, stock int32, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE products SET category_id=$3,name=$4,description=$5,daily_price=$6,stock=$7,updated_at=$8 WHERE id=$1 AND store_id=$2`, id, store, categoryID, name, description, dailyPrice, stock, now)
}

func lockProductState(ctx context.Context, db database.Executor, id string, store string, outArchived *bool) error {
	return db.QueryRow(ctx, `SELECT archived FROM products WHERE id=$1 AND store_id=$2 FOR UPDATE`, id, store).Scan(outArchived)
}

func setPublication(ctx context.Context, db database.Executor, id string, value bool, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE products SET published=$2,updated_at=$3 WHERE id=$1`, id, value, now)
}

func setArchive(ctx context.Context, db database.Executor, id string, value bool, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE products SET archived=$2,published=CASE WHEN $2 THEN false ELSE published END,updated_at=$3 WHERE id=$1`, id, value, now)
}

func listModerationHistory(ctx context.Context, db database.Executor, id string) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT actor_id::text,hidden,reason,created_at FROM product_moderation_history WHERE product_id=$1 ORDER BY created_at,id`, id)
}

func lockModerationState(ctx context.Context, db database.Executor, id string, outCurrent *bool) error {
	return db.QueryRow(ctx, `SELECT hidden FROM products WHERE id=$1 FOR UPDATE`, id).Scan(outCurrent)
}

func setModeration(ctx context.Context, db database.Executor, id string, hidden bool, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE products SET hidden=$2,updated_at=$3 WHERE id=$1`, id, hidden, now)
}

func insertModerationHistory(ctx context.Context, db database.Executor, id string, actor string, hidden bool, reason string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO product_moderation_history(product_id,actor_id,hidden,reason,created_at) VALUES($1,$2,$3,$4,$5)`, id, actor, hidden, reason, now)
}

func scan(row scanner) (Product, error) {
	var p Product
	err := row.Scan(&p.ID, &p.StoreID, &p.StoreName, &p.StoreAddress, &p.CategoryID, &p.CategoryName, &p.Name, &p.Description, &p.DailyPrice, &p.Stock, &p.Published, &p.Archived, &p.Hidden, &p.PhotoIDs, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, ErrNotFound
	}
	return p, err
}

func dbError(err error) error {
	var e *pgconn.PgError
	if errors.As(err, &e) && (e.Code == "23503" || e.Code == "22P02") {
		return ErrInvalid
	}
	return err
}

func find(ctx context.Context, tx pgx.Tx, id string) (Product, error) {
	return scan(selectProduct(ctx, tx, id))
}

const fields = `p.id::text,p.store_id::text,s.name,s.address,p.category_id::text,c.name,p.name,p.description,p.daily_price,p.stock,p.published,p.archived,p.hidden,ARRAY(SELECT media_id::text FROM product_photos WHERE product_id=p.id ORDER BY position),p.created_at,p.updated_at`

const joins = ` FROM products p JOIN stores s ON s.id=p.store_id JOIN categories c ON c.id=p.category_id `

func listProducts(ctx context.Context, db database.Executor, scope, owner, search, categoryID string, page, size int) ([]Product, error) {
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
	rows, err := db.Query(ctx, query, args...)
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

func getProduct(ctx context.Context, db database.Executor, id, scope, owner string) (Product, error) {
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
	return scan(db.QueryRow(ctx, query, args...))
}

type scanner interface{ Scan(...any) error }
