package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"image"
	"image/png"
	"io"
	"log/slog"
	"net/http/httptest"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/content"
	"rentaid.local/api/internal/database"
	"rentaid.local/api/internal/product"
	"strings"
	"testing"
	"time"
)

func TestProductsIntegration(t *testing.T) {
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
	schema := pgx.Identifier{"phase06_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(random[:12]))}.Sanitize()
	if _, err = base.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = base.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE") }()
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = strings.Trim(schema, `"`)
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	clk := &fakeClock{now: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)}
	svc := &auth.Service{Pool: pool, Clock: clk, TTL: time.Hour}
	if err = svc.SeedAdmin(ctx, "admin@example.test", "Test-password-2026!"); err != nil {
		t.Fatal(err)
	}
	admin, _, err := svc.Login(ctx, "admin@example.test", "Test-password-2026!", "admin")
	if err != nil {
		t.Fatal(err)
	}
	owner, err := svc.Register(ctx, "owner@example.test", "Test-password-2026!", "Owner", "")
	if err != nil {
		t.Fatal(err)
	}
	other, err := svc.Register(ctx, "other@example.test", "Test-password-2026!", "Other", "")
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := svc.Login(ctx, owner.Email, "Test-password-2026!", "android")
	if err != nil {
		t.Fatal(err)
	}
	otherToken, _, err := svc.Login(ctx, other.Email, "Test-password-2026!", "android")
	if err != nil {
		t.Fatal(err)
	}
	var storeID, categoryID string
	if err = pool.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,'Toko','Jakarta','0812','pending',$2,$2) RETURNING id::text`, owner.ID, clk.Now()).Scan(&storeID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,'Lain','Jakarta','0812','approved',$2,$2)`, other.ID, clk.Now()); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES('Kamera',$1,$1) RETURNING id::text`, clk.Now()).Scan(&categoryID); err != nil {
		t.Fatal(err)
	}
	cfg := AuthConfig{Limiter: &auth.Limiter{Clock: clk, Max: 5, Window: time.Minute}}
	pages := &content.Service{Pool: pool, Clock: clk, Dir: t.TempDir()}
	handler, err := NewWithContent(pool, slog.New(slog.NewTextHandler(io.Discard, nil)), svc, cfg, pages)
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
	var imageBytes bytes.Buffer
	if err = png.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	photo, err := pages.UploadOwned(ctx, &imageBytes, &owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	input := map[string]any{"categoryId": categoryID, "name": "Kamera", "description": "Kamera sewa", "dailyPrice": 100000, "stock": 2, "photoIds": []string{photo.ID}}
	if rec := call("POST", "/api/v1/vendor/products", token, input); rec.Code != 403 {
		t.Fatalf("pending store: %d %s", rec.Code, rec.Body)
	}
	if _, err = pool.Exec(ctx, `UPDATE stores SET status='approved' WHERE id=$1`, storeID); err != nil {
		t.Fatal(err)
	}
	input["dailyPrice"] = 0
	if rec := call("POST", "/api/v1/vendor/products", token, input); rec.Code != 400 {
		t.Fatalf("invalid price: %d %s", rec.Code, rec.Body)
	}
	input["dailyPrice"] = 100000
	input["stock"] = -1
	if rec := call("POST", "/api/v1/vendor/products", token, input); rec.Code != 400 {
		t.Fatalf("invalid stock: %d %s", rec.Code, rec.Body)
	}
	input["stock"] = 2
	rec := call("POST", "/api/v1/vendor/products", token, input)
	if rec.Code != 201 {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var p product.Product
	if err = json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 404 {
		t.Fatalf("draft leaked: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/products", "", nil); rec.Code != 200 || strings.Contains(rec.Body.String(), p.ID) {
		t.Fatalf("draft listed: %d %s", rec.Code, rec.Body)
	}
	if rec = call("PUT", "/api/v1/vendor/products/"+p.ID, otherToken, input); rec.Code != 404 {
		t.Fatalf("other owner edit: %d %s", rec.Code, rec.Body)
	}
	if rec = call("PUT", "/api/v1/vendor/products/"+p.ID+"/publication", token, map[string]bool{"value": true}); rec.Code != 200 {
		t.Fatalf("publish: %d %s", rec.Code, rec.Body)
	}
	quotePath := "/api/v1/products/" + p.ID + "/quote?start_date=2026-11-04&end_date=2026-11-05&quantity=2"
	if rec = call("GET", quotePath, "", nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"days":2`) || !strings.Contains(rec.Body.String(), `"total":400000`) {
		t.Fatalf("quote: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID+"/quote?start_date=2026-11-05&end_date=2026-11-04&quantity=1", "", nil); rec.Code != 400 {
		t.Fatalf("invalid quote: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID+"/quote?start_date=2026-11-04&end_date=2026-11-05&quantity=3", "", nil); rec.Code != 400 {
		t.Fatalf("excess quantity: %d %s", rec.Code, rec.Body)
	}
	if _, err = pool.Exec(ctx, `UPDATE users SET phone='081234' WHERE id=$1`, other.ID); err != nil {
		t.Fatal(err)
	}
	checkoutCall := func(key string, expected int64) *httptest.ResponseRecorder {
		t.Helper()
		data, e := json.Marshal(map[string]any{"productId": p.ID, "startDate": "2026-11-04", "endDate": "2026-11-05", "quantity": 1, "expectedTotal": expected, "expectedAvailable": 2})
		if e != nil {
			t.Fatal(e)
		}
		req := httptest.NewRequest("POST", "/api/v1/checkout", bytes.NewReader(data))
		req.Header.Set("Authorization", "Bearer "+otherToken)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", key)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
		return recorder
	}
	if response := checkoutCall("changed", 1); response.Code != 409 || !strings.Contains(response.Body.String(), `"quote_changed"`) {
		t.Fatalf("changed checkout: %d %s", response.Code, response.Body)
	}
	created := checkoutCall("successful", 200000)
	if created.Code != 201 {
		t.Fatalf("checkout: %d %s", created.Code, created.Body)
	}
	var checkoutOrder struct {
		ID string `json:"id"`
	}
	if err = json.Unmarshal(created.Body.Bytes(), &checkoutOrder); err != nil {
		t.Fatal(err)
	}
	if response := checkoutCall("successful", 200000); response.Code != 201 || !strings.Contains(response.Body.String(), checkoutOrder.ID) {
		t.Fatalf("replay: %d %s", response.Code, response.Body)
	}
	if response := checkoutCall("successful", 100000); response.Code != 409 || !strings.Contains(response.Body.String(), `"idempotency_key_reuse"`) {
		t.Fatalf("reuse: %d %s", response.Code, response.Body)
	}
	if response := call("GET", "/api/v1/orders/"+checkoutOrder.ID, otherToken, nil); response.Code != 200 {
		t.Fatalf("order: %d %s", response.Code, response.Body)
	}
	if response := call("GET", "/api/v1/orders/"+checkoutOrder.ID, token, nil); response.Code != 404 {
		t.Fatalf("other order: %d %s", response.Code, response.Body)
	}
	if rec = call("GET", "/api/v1/media/"+photo.ID, "", nil); rec.Code != 200 {
		t.Fatalf("published photo: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 200 {
		t.Fatalf("public: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/vendor/products", otherToken, input); rec.Code != 400 {
		t.Fatalf("other owner photo: %d %s", rec.Code, rec.Body)
	}
	var category2 string
	if err = pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES('Audio',$1,$1) RETURNING id::text`, clk.Now()).Scan(&category2); err != nil {
		t.Fatal(err)
	}
	otherInput := map[string]any{"categoryId": category2, "name": "Produk lain", "description": "Kamera lain", "dailyPrice": 20000, "stock": 1, "photoIds": []string{}}
	rec = call("POST", "/api/v1/vendor/products", otherToken, otherInput)
	if rec.Code != 201 {
		t.Fatalf("other product: %d %s", rec.Code, rec.Body)
	}
	var second product.Product
	if err = json.Unmarshal(rec.Body.Bytes(), &second); err != nil {
		t.Fatal(err)
	}
	if rec = call("PUT", "/api/v1/vendor/products/"+second.ID+"/publication", otherToken, map[string]bool{"value": true}); rec.Code != 200 {
		t.Fatalf("other publication: %d %s", rec.Code, rec.Body)
	}
	page1 := call("GET", "/api/v1/products?page=1&page_size=1", "", nil)
	page2 := call("GET", "/api/v1/products?page=2&page_size=1", "", nil)
	var a, b []product.Product
	if page1.Code != 200 || page2.Code != 200 || json.Unmarshal(page1.Body.Bytes(), &a) != nil || json.Unmarshal(page2.Body.Bytes(), &b) != nil || len(a) != 1 || len(b) != 1 || a[0].ID == b[0].ID {
		t.Fatalf("pagination: %s %s", page1.Body, page2.Body)
	}
	filteredFirst := call("GET", "/api/v1/products?q=kamera&page=1&page_size=1", "", nil)
	filteredSecond := call("GET", "/api/v1/products?q=kamera&page=2&page_size=1", "", nil)
	var filteredA, filteredB []product.Product
	if filteredFirst.Code != 200 || filteredSecond.Code != 200 || json.Unmarshal(filteredFirst.Body.Bytes(), &filteredA) != nil || json.Unmarshal(filteredSecond.Body.Bytes(), &filteredB) != nil || len(filteredA) != 1 || len(filteredB) != 1 || filteredA[0].ID == filteredB[0].ID {
		t.Fatalf("filtered pagination: %s %s", filteredFirst.Body, filteredSecond.Body)
	}
	checks := []struct {
		path     string
		wantID   string
		absentID string
	}{
		{"/api/v1/products?q=produk%20LAIN", second.ID, p.ID},
		{"/api/v1/products?q=SEWA", p.ID, second.ID},
		{"/api/v1/products?category_id=" + categoryID, p.ID, second.ID},
		{"/api/v1/products?q=kamera&category_id=" + category2, second.ID, p.ID},
	}
	for _, c := range checks {
		rec = call("GET", c.path, "", nil)
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), c.wantID) || strings.Contains(rec.Body.String(), c.absentID) {
			t.Fatalf("filter %s: %d %s", c.path, rec.Code, rec.Body)
		}
	}
	if rec = call("GET", "/api/v1/products?q=%25", "", nil); rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("literal wildcard: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products?q="+strings.Repeat("x", 201), "", nil); rec.Code != 400 {
		t.Fatalf("oversized query: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products/not-a-uuid", "", nil); rec.Code != 400 {
		t.Fatalf("invalid product id: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products?category_id=invalid", "", nil); rec.Code != 400 {
		t.Fatalf("invalid category filter: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"storeAddress":"Jakarta"`) {
		t.Fatalf("pickup address: %d %s", rec.Code, rec.Body)
	}
	if rec = call("DELETE", "/api/v1/admin/categories/"+categoryID, admin, nil); rec.Code != 409 {
		t.Fatalf("category used: %d %s", rec.Code, rec.Body)
	}
	if rec = call("PUT", "/api/v1/admin/categories/"+categoryID, admin, map[string]string{"name": "Optik"}); rec.Code != 200 {
		t.Fatalf("rename category: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Optik") {
		t.Fatalf("renamed reference: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/products/"+p.ID+"/moderation", otherToken, map[string]any{"hidden": true, "reason": "Alasan"}); rec.Code != 403 {
		t.Fatalf("user moderation: %d", rec.Code)
	}
	if rec = call("POST", "/api/v1/admin/products/"+p.ID+"/moderation", admin, map[string]any{"hidden": true, "reason": " "}); rec.Code != 400 {
		t.Fatalf("missing reason: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/products/"+p.ID+"/moderation", admin, map[string]any{"hidden": true, "reason": "Perlu ditinjau"}); rec.Code != 200 {
		t.Fatalf("hide: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/media/"+photo.ID, "", nil); rec.Code != 404 {
		t.Fatalf("hidden photo leaked: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 404 {
		t.Fatalf("hidden product: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/products", "", nil); rec.Code != 200 || strings.Contains(rec.Body.String(), p.ID) {
		t.Fatalf("hidden listed: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products?q=kamera&category_id="+categoryID, "", nil); rec.Code != 200 || strings.Contains(rec.Body.String(), p.ID) {
		t.Fatalf("hidden search leaked: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/admin/products/"+p.ID, admin, nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Perlu ditinjau") {
		t.Fatalf("moderation history: %d %s", rec.Code, rec.Body)
	}
	if rec = call("POST", "/api/v1/admin/products/"+p.ID+"/moderation", admin, map[string]any{"hidden": false, "reason": "Sudah diperbaiki"}); rec.Code != 200 {
		t.Fatalf("restore: %d %s", rec.Code, rec.Body)
	}
	for _, status := range []string{"pending", "rejected"} {
		if _, err = pool.Exec(ctx, `UPDATE stores SET status=$2 WHERE id=$1`, storeID, status); err != nil {
			t.Fatal(err)
		}
		if rec = call("GET", "/api/v1/products", "", nil); rec.Code != 200 || strings.Contains(rec.Body.String(), p.ID) {
			t.Fatalf("%s listed: %d %s", status, rec.Code, rec.Body)
		}
		if rec = call("PUT", "/api/v1/vendor/products/"+p.ID+"/publication", token, map[string]bool{"value": true}); rec.Code != 403 {
			t.Fatalf("%s publication: %d", status, rec.Code)
		}
		if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 404 {
			t.Fatalf("%s store leaked: %d", status, rec.Code)
		}
	}
	if _, err = pool.Exec(ctx, `UPDATE stores SET status='suspended' WHERE id=$1`, storeID); err != nil {
		t.Fatal(err)
	}
	if rec = call("GET", "/api/v1/products", "", nil); rec.Code != 200 || strings.Contains(rec.Body.String(), p.ID) {
		t.Fatalf("suspended listed: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/media/"+photo.ID, "", nil); rec.Code != 404 {
		t.Fatalf("suspended photo leaked: %d", rec.Code)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 404 {
		t.Fatalf("suspended store leaked: %d", rec.Code)
	}
	if rec = call("PUT", "/api/v1/vendor/products/"+p.ID+"/publication", token, map[string]bool{"value": true}); rec.Code != 403 {
		t.Fatalf("suspended publication: %d", rec.Code)
	}
	if _, err = pool.Exec(ctx, `UPDATE stores SET status='approved' WHERE id=$1`, storeID); err != nil {
		t.Fatal(err)
	}
	if rec = call("PUT", "/api/v1/vendor/products/"+p.ID+"/archive", token, map[string]bool{"value": true}); rec.Code != 200 {
		t.Fatalf("archive: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products", "", nil); rec.Code != 200 || strings.Contains(rec.Body.String(), p.ID) {
		t.Fatalf("archived listed: %d %s", rec.Code, rec.Body)
	}
	if rec = call("GET", "/api/v1/products/"+p.ID, "", nil); rec.Code != 404 {
		t.Fatalf("archived leaked: %d", rec.Code)
	}
}
