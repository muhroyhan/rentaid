package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/content"
	"rentaid.local/api/internal/database"
)

func TestContentIntegration(t *testing.T) {
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
	schema := "phase03_" + strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(random[:12], "-", "a"), "_", "b"))
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err = base.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = base.Exec(context.Background(), "DROP SCHEMA "+identifier+" CASCADE") }()
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	clk := &fakeClock{now: time.Date(2026, 10, 31, 4, 0, 0, 0, time.UTC)}
	accounts := &auth.Service{Pool: pool, Clock: clk, TTL: 14 * 24 * time.Hour}
	if err = accounts.SeedAdmin(ctx, "admin@example.test", "Test-password-phase03!"); err != nil {
		t.Fatal(err)
	}
	admin, _, err := accounts.Login(ctx, "admin@example.test", "Test-password-phase03!", "admin")
	if err != nil {
		t.Fatal(err)
	}
	userHash, err := auth.HashPassword("Test-password-phase03!")
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, "INSERT INTO users(email,password_hash,role,created_at) VALUES($1,$2,'user',$3)", "user@example.test", userHash, clk.Now())
	if err != nil {
		t.Fatal(err)
	}
	user, _, err := accounts.Login(ctx, "user@example.test", "Test-password-phase03!", "android")
	if err != nil {
		t.Fatal(err)
	}
	pages := &content.Service{Pool: pool, Clock: clk, Dir: t.TempDir()}
	cfg := AuthConfig{AllowedOrigins: []string{"http://localhost:5173"}, Limiter: &auth.Limiter{Clock: clk, Max: 5, Window: time.Minute}}
	handler, err := NewWithContent(pool, slog.New(slog.NewTextHandler(io.Discard, nil)), accounts, cfg, pages)
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path, token, typ string, body []byte) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if typ != "" {
			req.Header.Set("Content-Type", typ)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	csrfReq := httptest.NewRequest("PUT", "/api/v1/admin/content/home", strings.NewReader(`{"title":"x","body":"x","imageId":null}`))
	csrfReq.Header.Set("Content-Type", "application/json")
	csrfReq.Header.Set("Origin", "http://localhost:5173")
	csrfReq.AddCookie(&http.Cookie{Name: sessionCookie, Value: admin})
	csrfRec := httptest.NewRecorder()
	handler.ServeHTTP(csrfRec, csrfReq)
	if csrfRec.Code != 403 {
		t.Fatalf("missing content csrf: %d", csrfRec.Code)
	}

	if rec := call("GET", "/api/v1/content/home", "", "", nil); rec.Code != 404 {
		t.Fatalf("unpublished: %d %s", rec.Code, rec.Body)
	}
	if rec := call("GET", "/api/v1/admin/content/home", user, "", nil); rec.Code != 403 {
		t.Fatalf("user admin access: %d", rec.Code)
	}
	if rec := call("PUT", "/api/v1/admin/content/home", user, "application/json", []byte(`{"title":"x","body":"x","imageId":null}`)); rec.Code != 403 {
		t.Fatalf("user content write: %d", rec.Code)
	}
	if rec := call("POST", "/api/v1/admin/media", user, "application/octet-stream", []byte("x")); rec.Code != 403 {
		t.Fatalf("user media upload: %d", rec.Code)
	}

	if rec := call("POST", "/api/v1/admin/media", "", "application/octet-stream", []byte("x")); rec.Code != 401 {
		t.Fatalf("anonymous upload: %d", rec.Code)
	}
	if rec := call("POST", "/api/v1/admin/media", admin, "application/octet-stream", []byte("not an image")); rec.Code != 400 {
		t.Fatalf("invalid image: %d %s", rec.Code, rec.Body)
	}
	oversized := make([]byte, content.MaxBytes+1)
	if rec := call("POST", "/api/v1/admin/media", admin, "application/octet-stream", oversized); rec.Code != 413 {
		t.Fatalf("oversized image: %d %s", rec.Code, rec.Body)
	}
	chunkedReq := httptest.NewRequest("POST", "/api/v1/admin/media", bytes.NewReader(oversized))
	chunkedReq.ContentLength = -1
	chunkedReq.Header.Set("Authorization", "Bearer "+admin)
	chunkedReq.Header.Set("Content-Type", "application/octet-stream")
	chunkedRec := httptest.NewRecorder()
	handler.ServeHTTP(chunkedRec, chunkedReq)
	if chunkedRec.Code != 413 {
		t.Fatalf("chunked oversized: %d %s", chunkedRec.Code, chunkedRec.Body)
	}
	if rec := call("POST", "/api/v1/admin/media", admin, "application/octet-stream", []byte{137, 80, 78, 71, 13, 10, 26, 10, 0, 0}); rec.Code != 400 {
		t.Fatalf("forged png: %d", rec.Code)
	}
	if rec := call("PUT", "/api/v1/admin/content/faq", admin, "application/json", []byte(`{"title":"   ","body":"\n\t","imageId":null}`)); rec.Code != 200 {
		t.Fatalf("whitespace draft: %d %s", rec.Code, rec.Body)
	}
	if rec := call("POST", "/api/v1/admin/content/faq/publish", admin, "", nil); rec.Code != 400 {
		t.Fatalf("whitespace publication: %d %s", rec.Code, rec.Body)
	}

	pic := image.NewRGBA(image.Rect(0, 0, 2, 2))
	pic.Set(0, 0, color.RGBA{R: 255, A: 255})
	var encoded bytes.Buffer
	if err = png.Encode(&encoded, pic); err != nil {
		t.Fatal(err)
	}
	var jpegBytes bytes.Buffer
	if err = jpeg.Encode(&jpegBytes, pic, nil); err != nil {
		t.Fatal(err)
	}
	webpBytes, err := base64.StdEncoding.DecodeString("UklGRgYCAABXRUJQVlA4WAoAAAAgAAAAAAAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggGAAAADABAJ0BKgEAAQABQCYlpAADcAD+/TZoAA==")
	if err != nil {
		t.Fatal(err)
	}
	for _, fixture := range []struct {
		data []byte
		mime string
	}{{jpegBytes.Bytes(), "image/jpeg"}, {webpBytes, "image/webp"}} {
		rec := call("POST", "/api/v1/admin/media", admin, "application/octet-stream", fixture.data)
		if rec.Code != 201 {
			t.Fatalf("upload %s: %d %s", fixture.mime, rec.Code, rec.Body)
		}
		var m content.Media
		if err = json.Unmarshal(rec.Body.Bytes(), &m); err != nil || m.ContentType != fixture.mime {
			t.Fatalf("invalid upload type: %+v %v", m, err)
		}
	}

	uploaded := call("POST", "/api/v1/admin/media", admin, "application/octet-stream", encoded.Bytes())
	if uploaded.Code != 201 {
		t.Fatalf("upload: %d %s", uploaded.Code, uploaded.Body)
	}
	var media content.Media
	if err = json.Unmarshal(uploaded.Body.Bytes(), &media); err != nil {
		t.Fatal(err)
	}
	if media.ContentType != "image/png" || media.Size != int64(encoded.Len()) {
		t.Fatalf("bad media: %+v", media)
	}
	if rec := call("GET", "/api/v1/media/"+media.ID, "", "", nil); rec.Code != 404 {
		t.Fatalf("draft image leaked: %d", rec.Code)
	}
	if rec := call("GET", "/api/v1/admin/media/"+media.ID, admin, "", nil); rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), encoded.Bytes()) {
		t.Fatalf("admin image: %d %s", rec.Code, rec.Body)
	}
	input := fmt.Sprintf(`{"title":"Judul publik","body":"Konten publik","imageId":%q}`, media.ID)
	if rec := call("PUT", "/api/v1/admin/content/home", admin, "application/json", []byte(input)); rec.Code != 200 {
		t.Fatalf("save draft: %d %s", rec.Code, rec.Body)
	}
	if rec := call("GET", "/api/v1/content/home", "", "", nil); rec.Code != 404 {
		t.Fatalf("draft leaked: %d", rec.Code)
	}
	if rec := call("POST", "/api/v1/admin/content/home/publish", admin, "", nil); rec.Code != 200 {
		t.Fatalf("publish: %d %s", rec.Code, rec.Body)
	}
	if rec := call("GET", "/api/v1/media/"+media.ID, "", "", nil); rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), encoded.Bytes()) {
		t.Fatalf("public media: %d %s", rec.Code, rec.Body)
	}
	if rec := call("GET", "/api/v1/content/home", "", "", nil); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Konten publik") {
		t.Fatalf("public content: %d %s", rec.Code, rec.Body)
	}
	updated := []byte(`{"title":"Judul draft","body":"Konten rahasia","imageId":null}`)
	if rec := call("PUT", "/api/v1/admin/content/home", admin, "application/json", updated); rec.Code != 200 {
		t.Fatalf("update draft: %d %s", rec.Code, rec.Body)
	}
	rec := call("GET", "/api/v1/content/home", "", "", nil)
	if rec.Code != 200 || strings.Contains(rec.Body.String(), "rahasia") || !strings.Contains(rec.Body.String(), "Konten publik") {
		t.Fatalf("draft update leaked: %d %s", rec.Code, rec.Body)
	}
	restarted := &content.Service{Pool: pool, Clock: clk, Dir: pages.Dir}
	p, err := restarted.Public(ctx, "home")
	if err != nil || p.Body != "Konten publik" {
		t.Fatalf("restart lost content: %+v %v", p, err)
	}
	raw, mime, err := restarted.ReadMedia(ctx, media.ID, true)
	if err != nil || mime != "image/png" || !bytes.Equal(raw, encoded.Bytes()) {
		t.Fatal("restart lost media", err)
	}
}
