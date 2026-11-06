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
	"net/http/httptest"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/database"
	"rentaid.local/api/internal/store"
	"strings"
	"testing"
	"time"
)

func TestAccountsPhase04(t *testing.T) {
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
	token, err := auth.RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	name := "phase04_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(token[:12]))
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
	clk := &fakeClock{now: time.Date(2026, 10, 31, 4, 0, 0, 0, time.UTC)}
	svc := &auth.Service{Pool: pool, Clock: clk, TTL: time.Hour}
	if err = svc.SeedAdmin(ctx, "admin@example.test", "Test-password-2026!"); err != nil {
		t.Fatal(err)
	}
	admin, _, err := svc.Login(ctx, "admin@example.test", "Test-password-2026!", "admin")
	if err != nil {
		t.Fatal(err)
	}
	cfg := AuthConfig{AllowedOrigins: []string{"http://localhost:5173"}, Limiter: &auth.Limiter{Clock: clk, Max: 5, Window: time.Minute}}
	handler, err := NewWithAuth(pool, slog.New(slog.NewTextHandler(io.Discard, nil)), svc, cfg)
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
	input := map[string]string{"email": "user@example.test", "password": "Test-password-2026!", "name": "Pengguna", "phone": "", "client": "android"}
	rec := call("POST", "/api/v1/auth/register", "", input)
	if rec.Code != 201 {
		t.Fatalf("register: %d %s", rec.Code, rec.Body)
	}
	var profile auth.Profile
	if err = json.Unmarshal(rec.Body.Bytes(), &profile); err != nil {
		t.Fatal(err)
	}
	if rec = call("POST", "/api/v1/auth/register", "", input); rec.Code != 409 {
		t.Fatalf("duplicate email: %d %s", rec.Code, rec.Body)
	}
	user, _, err := svc.Login(ctx, input["email"], input["password"], "android")
	if err != nil {
		t.Fatal(err)
	}
	if rec = call("GET", "/api/v1/admin/users", user, nil); rec.Code != 403 {
		t.Fatalf("admin access: %d %s", rec.Code, rec.Body)
	}
	if rec = call("PUT", "/api/v1/profile", user, map[string]string{"name": "Baru", "phone": "08123"}); rec.Code != 200 {
		t.Fatalf("update profile: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/vendor/dashboard", admin, nil); rec.Code != 403 {
		t.Fatalf("admin vendor dashboard: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/vendor/dashboard", "", nil); rec.Code != 401 {
		t.Fatalf("anonymous dashboard: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/vendor/dashboard", user, nil); rec.Code != 403 {
		t.Fatalf("no store dashboard: %d", rec.Code)
	}
	storeInput := map[string]string{"name": "Toko Satu", "address": "Jakarta", "phone": "08123"}
	rec = call("POST", "/api/v1/store", user, storeInput)
	if rec.Code != 201 {
		t.Fatalf("create store: %d %s", rec.Code, rec.Body)
	}
	var created store.Store
	if err = json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if rec = call("POST", "/api/v1/store", user, storeInput); rec.Code != 409 {
		t.Fatalf("second store: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/vendor/products", user, nil); rec.Code != 403 {
		t.Fatalf("pending products: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/vendor/dashboard", user, nil); rec.Code != 403 {
		t.Fatalf("pending dashboard: %d %s", rec.Code, rec.Body)
	}
	gate := &store.Service{Pool: pool, Clock: clk}
	if ok, e := gate.Approved(ctx, profile.ID); e != nil || ok {
		t.Fatalf("pending gate: %t %v", ok, e)
	}
	other, err := svc.Register(ctx, "other@example.test", "Test-password-2026!", "Other", "")
	if err != nil {
		t.Fatal(err)
	}
	otherToken, _, err := svc.Login(ctx, other.Email, "Test-password-2026!", "android")
	if err != nil {
		t.Fatal(err)
	}
	if rec = call("PUT", "/api/v1/store", otherToken, storeInput); rec.Code != 404 {
		t.Fatalf("other owner edit: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/stores/"+created.ID+"/decision", otherToken, map[string]string{"action": "approve", "reason": ""}); rec.Code != 403 {
		t.Fatalf("user decision: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/stores/"+created.ID+"/decision", admin, map[string]string{"action": "reject", "reason": " "}); rec.Code != 400 {
		t.Fatalf("missing reason: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/stores/"+created.ID+"/decision", admin, map[string]string{"action": "reject", "reason": "Alamat kurang jelas"}); rec.Code != 200 {
		t.Fatalf("reject: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/store/history", user, nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Alamat kurang jelas") {
		t.Fatalf("owner history: %d %s", rec.Code, rec.Body)
	}
	storeInput["address"] = "Jakarta Selatan"
	if rec = call("PUT", "/api/v1/store", user, storeInput); rec.Code != 200 {
		t.Fatalf("resubmit: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/stores/"+created.ID+"/decision", admin, map[string]string{"action": "approve", "reason": ""}); rec.Code != 200 {
		t.Fatalf("approve: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/vendor/dashboard", user, nil); rec.Code != 200 {
		t.Fatalf("approved dashboard: %d %s", rec.Code, rec.Body)
	}
	if ok, e := gate.Approved(ctx, profile.ID); e != nil || !ok {
		t.Fatalf("approved gate: %t %v", ok, e)
	}
	if rec = call("POST", "/api/v1/admin/stores/"+created.ID+"/decision", admin, map[string]string{"action": "suspend", "reason": "Pemeriksaan"}); rec.Code != 200 {
		t.Fatalf("suspend store: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/vendor/products", user, nil); rec.Code != 403 {
		t.Fatalf("suspended products: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/vendor/dashboard", user, nil); rec.Code != 403 {
		t.Fatalf("suspended dashboard: %d %s", rec.Code, rec.Body)
	}
	if ok, e := gate.Approved(ctx, profile.ID); e != nil || ok {
		t.Fatalf("suspended gate: %t %v", ok, e)
	}
	if rec = call("GET", "/api/v1/admin/stores/"+created.ID, admin, nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Alamat kurang jelas") || !strings.Contains(rec.Body.String(), "Pemeriksaan") {
		t.Fatalf("history: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/stores/"+created.ID+"/decision", admin, map[string]string{"action": "activate", "reason": ""}); rec.Code != 200 {
		t.Fatalf("activate store: %d %s", rec.Code, rec.Body)
	}
	if rec = call("PUT", "/api/v1/admin/users/"+profile.ID, admin, map[string]string{"status": "suspended"}); rec.Code != 200 {
		t.Fatalf("suspend: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/profile", user, nil); rec.Code != 401 {
		t.Fatalf("suspended session: %d", rec.Code)
	}
	if _, _, err = svc.Login(ctx, input["email"], input["password"], "android"); err != auth.ErrInvalidCredentials {
		t.Fatalf("suspended login: %v", err)
	}
	if rec = call("PUT", "/api/v1/admin/users/"+profile.ID, admin, map[string]string{"status": "active"}); rec.Code != 200 {
		t.Fatalf("activate: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/profile", user, nil); rec.Code != 401 {
		t.Fatalf("revoked session reused: %d", rec.Code)
	}
}
