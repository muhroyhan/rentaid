//go:build integration

package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/category"
	"rentaid.local/api/internal/database"
	"strings"
	"testing"
	"time"
)

func TestCategoriesIntegration(t *testing.T) {
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
	name := "phase05_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(random[:12]))
	identifier := pgx.Identifier{name}.Sanitize()
	if _, err = base.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = base.Exec(ctx, "DROP SCHEMA "+identifier+" CASCADE") }()
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
	clk := &fakeClock{now: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)}
	accounts := &auth.Service{Pool: pool, Clock: clk, TTL: time.Hour}
	if err = accounts.SeedAdmin(ctx, "admin@example.test", "Test-password-2026!"); err != nil {
		t.Fatal(err)
	}
	admin, _, err := accounts.Login(ctx, "admin@example.test", "Test-password-2026!", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = accounts.Register(ctx, "user@example.test", "Test-password-2026!", "Pengguna", ""); err != nil {
		t.Fatal(err)
	}
	user, _, err := accounts.Login(ctx, "user@example.test", "Test-password-2026!", "android")
	if err != nil {
		t.Fatal(err)
	}
	cfg := AuthConfig{AllowedOrigins: []string{"http://localhost:5173"}, Limiter: &auth.Limiter{Clock: clk, Max: 5, Window: time.Minute}}
	handler, err := NewWithAuth(pool, slog.New(slog.NewTextHandler(io.Discard, nil)), accounts, cfg)
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path, token string, body any) *httptest.ResponseRecorder {
		t.Helper()
		var buf bytes.Buffer
		if body != nil {
			if err := json.NewEncoder(&buf).Encode(body); err != nil {
				t.Fatal(err)
			}
		}
		req := httptest.NewRequest(method, path, &buf)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	if rec := call("POST", "/api/v1/admin/categories", "", map[string]string{"name": "Kamera"}); rec.Code != 401 {
		t.Fatalf("anonymous: %d", rec.Code)
	}
	if rec := call("POST", "/api/v1/admin/categories", user, map[string]string{"name": "Kamera"}); rec.Code != 403 {
		t.Fatalf("user: %d", rec.Code)
	}
	req := httptest.NewRequest("POST", "/api/v1/admin/categories", strings.NewReader(`{"name":"Kamera"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://localhost:5173")
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: admin})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatalf("csrf: %d", rec.Code)
	}
	if rec = call("POST", "/api/v1/admin/categories", admin, map[string]string{"name": "   "}); rec.Code != 400 {
		t.Fatalf("invalid: %d %s", rec.Code, rec.Body)
	}
	rec = call("POST", "/api/v1/admin/categories", admin, map[string]string{"name": "Kamera"})
	if rec.Code != 201 {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var first category.Category
	if err = json.Unmarshal(rec.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	rec = call("POST", "/api/v1/admin/categories", admin, map[string]string{"name": "Kamera"})
	if rec.Code != 201 {
		t.Fatalf("create second: %d %s", rec.Code, rec.Body)
	}
	var second category.Category
	if err = json.Unmarshal(rec.Body.Bytes(), &second); err != nil {
		t.Fatal(err)
	}
	page1 := call("GET", "/api/v1/categories?page=1&page_size=1", "", nil)
	page2 := call("GET", "/api/v1/categories?page=2&page_size=1", "", nil)
	var a, b []category.Category
	if json.Unmarshal(page1.Body.Bytes(), &a) != nil || json.Unmarshal(page2.Body.Bytes(), &b) != nil || len(a) != 1 || len(b) != 1 || a[0].ID == b[0].ID {
		t.Fatalf("pagination: %s %s", page1.Body, page2.Body)
	}
	if _, err = pool.Exec(ctx, `CREATE TABLE product_fixture (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT)`); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO product_fixture(category_id) VALUES($1)`, first.ID); err != nil {
		t.Fatal(err)
	}
	if rec = call("DELETE", "/api/v1/admin/categories/"+first.ID, admin, nil); rec.Code != 409 {
		t.Fatalf("in-use: %d %s", rec.Code, rec.Body)
	}
	if rec = call("PUT", "/api/v1/admin/categories/"+first.ID, admin, map[string]string{"name": "Kamera Digital"}); rec.Code != 200 {
		t.Fatalf("rename: %d %s", rec.Code, rec.Body)
	}
	var refName string
	if err = pool.QueryRow(ctx, `SELECT c.name FROM product_fixture p JOIN categories c ON c.id=p.category_id`).Scan(&refName); err != nil || refName != "Kamera Digital" {
		t.Fatalf("reference changed: %s %v", refName, err)
	}
	if _, err = pool.Exec(ctx, `CREATE TABLE product_fixture_no_action (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES categories(id) ON DELETE NO ACTION)`); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO product_fixture_no_action(category_id) VALUES($1)`, second.ID); err != nil {
		t.Fatal(err)
	}
	if rec = call("DELETE", "/api/v1/admin/categories/"+second.ID, admin, nil); rec.Code != 409 {
		t.Fatalf("no action in-use: %d %s", rec.Code, rec.Body)
	}
	if _, err = pool.Exec(ctx, `DELETE FROM product_fixture_no_action`); err != nil {
		t.Fatal(err)
	}
	if rec = call("DELETE", "/api/v1/admin/categories/"+second.ID, user, nil); rec.Code != 403 {
		t.Fatalf("delete user: %d", rec.Code)
	}
	if rec = call("DELETE", "/api/v1/admin/categories/"+second.ID, admin, nil); rec.Code != 200 {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body)
	}
	if rec = call("DELETE", "/api/v1/admin/categories/"+second.ID, admin, nil); rec.Code != 404 {
		t.Fatalf("delete missing: %d %s", rec.Code, rec.Body)
	}
}
