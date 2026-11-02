package demo

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"rentaid.local/api/internal/auth"
)

// SeedProducts adds local demo examples without changing existing seeded products.
func SeedProducts(ctx context.Context, svc *auth.Service) error {
	tx, err := svc.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(726368924)`); err != nil {
		return err
	}
	var store string
	err = tx.QueryRow(ctx, `SELECT s.id::text FROM stores s JOIN users u ON u.id=s.owner_id WHERE u.email='demo.approved@example.test' AND u.role='user' AND s.status='approved'`).Scan(&store)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	now := svc.Clock.Now().UTC()
	items := []struct {
		key, category, name, description string
		price                            int64
		stock                            int
		published                        bool
	}{
		{"camera", "Elektronik", "Kamera Mirrorless", "Kamera ringkas untuk kebutuhan dokumentasi.", 150000, 3, true},
		{"tent", "Peralatan Luar Ruang", "Tenda Empat Orang", "Tenda untuk kegiatan luar ruang.", 100000, 4, true},
		{"speaker", "Elektronik", "Speaker Portabel", "Speaker ringkas untuk acara kecil.", 75000, 2, false},
	}
	for _, item := range items {
		var exists bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM demo_product_seeds WHERE seed_key=$1)`, item.key).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		var category string
		err = tx.QueryRow(ctx, `SELECT id::text FROM categories WHERE name=$1 ORDER BY id LIMIT 1`, item.category).Scan(&category)
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES($1,$2,$2) RETURNING id::text`, item.category, now).Scan(&category)
		}
		if err != nil {
			return err
		}
		var id string
		err = tx.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id::text`, store, category, item.name, item.description, item.price, item.stock, item.published, now).Scan(&id)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO demo_product_seeds(seed_key,product_id) VALUES($1,$2)`, item.key, id); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
