package demo

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/clock"
	"rentaid.local/api/internal/database"
	"strings"
	"testing"
	"time"
)

func TestSeedIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	base, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer base.Close()
	random, err := auth.RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	name := "seed04_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(random[:12]))
	identifier := pgx.Identifier{name}.Sanitize()
	if _, err = base.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = base.Exec(ctx, "DROP SCHEMA "+identifier+" CASCADE") }()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	svc := &auth.Service{Pool: pool, Clock: clock.System{}, TTL: time.Hour}
	if err = svc.SeedAdmin(ctx, "admin@example.test", "Test-password-2026!"); err != nil {
		t.Fatal(err)
	}
	if err = Seed(ctx, svc, "admin@example.test", "Demo-password-2026!"); err != nil {
		t.Fatal(err)
	}
	if err = Seed(ctx, svc, "admin@example.test", "Different-demo-password!"); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = pool.QueryRow(ctx, `SELECT count(DISTINCT status) FROM stores`).Scan(&count); err != nil || count != 4 {
		t.Fatalf("fixture statuses: %d %v", count, err)
	}
	if _, _, err = svc.Login(ctx, "demo.pending@example.test", "Demo-password-2026!", "android"); err != nil {
		t.Fatalf("seed changed password: %v", err)
	}
}
