//go:build integration

package quote

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/database"
	"strings"
	"testing"
	"time"
)

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }
func TestAvailabilityIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not configured")
	}
	ctx := context.Background()
	base, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer base.Close()
	token, err := auth.RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	name := "phase10_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(token[:12]))
	schema := pgx.Identifier{name}.Sanitize()
	if _, err = base.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = base.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE") }()
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = name
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2024, 11, 1, 0, 0, 0, 0, time.UTC)
	var user, store, category, product string
	if err = pool.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,created_at) VALUES ('test@example.test','x','user',$1) RETURNING id::text`, now).Scan(&user); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES ($1,'Store','Address','123','approved',$2,$2) RETURNING id::text`, user, now).Scan(&store); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES ('Category',$1,$1) RETURNING id::text`, now).Scan(&category); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at) VALUES($1,$2,'Product','Description',10000,5,true,$3,$3) RETURNING id::text`, store, category, now).Scan(&product); err != nil {
		t.Fatal(err)
	}
	add := func(start, end, status string, qty int, until time.Time) {
		t.Helper()
		if _, err := pool.Exec(ctx, `INSERT INTO orders(product_id,start_date,end_date,quantity,status,hold_until,created_at) VALUES($1,$2::date,$3::date,$4,$5,$6,$7)`, product, start, end, qty, status, until, now); err != nil {
			t.Fatal(err)
		}
	}
	add("2024-11-04", "2024-11-04", "confirmed", 2, now)
	add("2024-11-05", "2024-11-05", "renting", 3, now)
	add("2024-11-05", "2024-11-05", "pending_payment", 1, now.Add(time.Minute))
	add("2024-11-04", "2024-11-05", "pending_payment", 5, now)
	add("2024-11-04", "2024-11-05", "cancelled", 5, now)
	svc := Service{Pool: pool, Clock: fixedClock{now}}
	q, err := svc.Calculate(ctx, product, "2024-11-04", "2024-11-05", 1)
	if err != nil || q.Days != 2 || q.Available != 1 || q.Total != 20000 {
		t.Fatalf("quote=%+v err=%v", q, err)
	}
	if _, err = svc.Calculate(ctx, product, "2024-11-04", "2024-11-05", 2); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("want unavailable: %v", err)
	}
	if _, err = svc.Calculate(ctx, product, "2024-11-04", "2024-11-05", 6); !errors.Is(err, ErrInvalid) {
		t.Fatalf("want invalid quantity: %v", err)
	}
	var count int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM orders").Scan(&count); err != nil || count != 5 {
		t.Fatalf("quote changed orders: %d %v", count, err)
	}
	if _, err = pool.Exec(ctx, "UPDATE products SET hidden=true WHERE id=$1", product); err != nil {
		t.Fatal(err)
	}
	if _, err = svc.Calculate(ctx, product, "2024-11-04", "2024-11-05", 1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want not found: %v", err)
	}
}
