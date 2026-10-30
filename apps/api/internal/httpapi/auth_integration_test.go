package httpapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"

	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/database"
)

type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time { return c.now }

func TestAuthIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	now := &fakeClock{now: time.Date(2026, 10, 31, 3, 0, 0, 0, time.UTC)}
	svc := &auth.Service{Pool: pool, Clock: now, TTL: 14 * 24 * time.Hour}
	suffix, err := auth.RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	suffix = strings.ToLower(suffix)
	admin := "admin-" + suffix + "@example.test"
	user := "user-" + suffix + "@example.test"
	password := "Testing-password-2026!"
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), "DELETE FROM users WHERE email=$1 OR email=$2", admin, user)
	})
	if err = svc.SeedAdmin(ctx, admin, password); err != nil {
		t.Fatal(err)
	}
	var firstHash string
	if err = pool.QueryRow(ctx, "SELECT password_hash FROM users WHERE email=$1", admin).Scan(&firstHash); err != nil {
		t.Fatal(err)
	}
	if err = svc.SeedAdmin(ctx, admin, "Different-password-2026!"); err != nil {
		t.Fatal(err)
	}
	var again string
	if err = pool.QueryRow(ctx, "SELECT password_hash FROM users WHERE email=$1", admin).Scan(&again); err != nil || firstHash != again {
		t.Fatal("seed changed existing password", err)
	}
	if firstHash == password {
		t.Fatal("password was stored in plaintext")
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, "INSERT INTO users(email,password_hash,role,created_at) VALUES($1,$2,'user',$3)", user, hash, now.Now())
	if err != nil {
		t.Fatal(err)
	}
	cfg := AuthConfig{AllowedOrigins: []string{"http://localhost:5173"}, Limiter: &auth.Limiter{Clock: now, Max: 5, Window: 15 * time.Minute}}
	handler, err := NewWithAuth(pool, slog.New(slog.NewTextHandler(io.Discard, nil)), svc, cfg)
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path string, body any, cookies []*http.Cookie, headers map[string]string, ip string) *httptest.ResponseRecorder {
		t.Helper()
		var buf bytes.Buffer
		if body != nil {
			if e := json.NewEncoder(&buf).Encode(body); e != nil {
				t.Fatal(e)
			}
		}
		request := httptest.NewRequest(method, path, &buf)
		request.RemoteAddr = ip + ":1234"
		if body != nil {
			request.Header.Set("Content-Type", "application/json")
		}
		for _, c := range cookies {
			request.AddCookie(c)
		}
		for k, v := range headers {
			request.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, request)
		return rec
	}
	csrf := call("GET", "/api/v1/auth/csrf", nil, nil, nil, "127.0.0.1")
	if csrf.Code != 200 {
		t.Fatalf("csrf: %d %s", csrf.Code, csrf.Body)
	}
	var csrfBody struct {
		Token string `json:"csrfToken"`
	}
	if err = json.Unmarshal(csrf.Body.Bytes(), &csrfBody); err != nil {
		t.Fatal(err)
	}
	cookies := csrf.Result().Cookies()
	headers := map[string]string{"Origin": "http://localhost:5173", "X-CSRF-Token": csrfBody.Token}
	login := func(email, pass, client, ip string) *httptest.ResponseRecorder {
		return call("POST", "/api/v1/auth/login", map[string]string{"email": email, "password": pass, "client": client}, cookies, headers, ip)
	}
	if rec := login(admin, "wrong", "admin", "127.0.0.2"); rec.Code != 401 {
		t.Fatalf("wrong password: %d %s", rec.Code, rec.Body)
	}
	if rec := login(admin, password, "marketplace", "127.0.0.3"); rec.Code != 403 {
		t.Fatalf("admin marketplace: %d %s", rec.Code, rec.Body)
	}
	if rec := login(user, password, "admin", "127.0.0.4"); rec.Code != 403 {
		t.Fatalf("user admin login: %d %s", rec.Code, rec.Body)
	}
	if rec := call("POST", "/api/v1/auth/login", map[string]string{"email": admin, "password": password, "client": "admin"}, cookies, nil, "127.0.0.5"); rec.Code != 403 {
		t.Fatalf("login without csrf: %d", rec.Code)
	}
	badOrigin := map[string]string{"Origin": "http://evil.test", "X-CSRF-Token": csrfBody.Token}
	if rec := call("POST", "/api/v1/auth/login", map[string]string{"email": admin, "password": password, "client": "admin"}, cookies, badOrigin, "127.0.0.6"); rec.Code != 403 {
		t.Fatalf("bad origin: %d", rec.Code)
	}
	adminLogin := login(admin, password, "admin", "127.0.0.7")
	if adminLogin.Code != 200 {
		t.Fatalf("admin login: %d %s", adminLogin.Code, adminLogin.Body)
	}
	var body struct {
		CSRF  string    `json:"csrfToken"`
		User  auth.User `json:"user"`
		Token string    `json:"token"`
	}
	if err = json.Unmarshal(adminLogin.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Token != "" || body.CSRF == "" {
		t.Fatal("browser response has wrong token fields")
	}
	var sessionCookieValue *http.Cookie
	for _, c := range adminLogin.Result().Cookies() {
		if c.Name == sessionCookie {
			sessionCookieValue = c
		}
	}
	if sessionCookieValue == nil || !sessionCookieValue.HttpOnly || sessionCookieValue.SameSite != http.SameSiteLaxMode {
		t.Fatal("session cookie attributes missing")
	}
	hashToken := sha256.Sum256([]byte(sessionCookieValue.Value))
	var count int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM sessions WHERE token_hash=$1", hashToken[:]).Scan(&count); err != nil || count != 1 {
		t.Fatal("session hash missing", err)
	}
	loggedCookies := []*http.Cookie{sessionCookieValue}
	if rec := call("GET", "/api/v1/admin/me", nil, loggedCookies, nil, "127.0.0.7"); rec.Code != 200 {
		t.Fatalf("admin me: %d %s", rec.Code, rec.Body)
	}
	if rec := call("POST", "/api/v1/auth/logout", nil, loggedCookies, map[string]string{"Origin": "http://localhost:5173"}, "127.0.0.7"); rec.Code != 403 {
		t.Fatalf("missing csrf logout: %d", rec.Code)
	}
	if rec := call("POST", "/api/v1/auth/logout", nil, loggedCookies, map[string]string{"Origin": "http://evil.test", "X-CSRF-Token": body.CSRF}, "127.0.0.7"); rec.Code != 403 {
		t.Fatalf("bad origin logout: %d", rec.Code)
	}
	if rec := call("POST", "/api/v1/auth/logout", nil, loggedCookies, map[string]string{"Origin": "http://localhost:5173", "X-CSRF-Token": body.CSRF}, "127.0.0.7"); rec.Code != 200 {
		t.Fatalf("logout: %d %s", rec.Code, rec.Body)
	}
	if rec := call("GET", "/api/v1/admin/me", nil, loggedCookies, nil, "127.0.0.7"); rec.Code != 401 {
		t.Fatalf("revoked session: %d", rec.Code)
	}
	mobile := login(user, password, "android", "127.0.0.8")
	if mobile.Code != 200 {
		t.Fatalf("mobile login: %d %s", mobile.Code, mobile.Body)
	}
	var mobileBody struct {
		Token string `json:"token"`
		CSRF  string `json:"csrfToken"`
	}
	if err = json.Unmarshal(mobile.Body.Bytes(), &mobileBody); err != nil || mobileBody.Token == "" || mobileBody.CSRF != "" {
		t.Fatal("invalid bearer response", err)
	}
	bearer := map[string]string{"Authorization": "Bearer " + mobileBody.Token}
	if rec := call("GET", "/api/v1/admin/me", nil, nil, bearer, "127.0.0.8"); rec.Code != 403 {
		t.Fatalf("non-admin endpoint: %d", rec.Code)
	}
	if rec := call("POST", "/api/v1/auth/logout", nil, nil, bearer, "127.0.0.8"); rec.Code != 200 {
		t.Fatalf("bearer logout: %d %s", rec.Code, rec.Body)
	}
	suspendedToken, _, err := svc.Login(ctx, user, password, "android")
	if err != nil {
		t.Fatal(err)
	}
	var userID string
	if err = pool.QueryRow(ctx, "SELECT id::text FROM users WHERE email=$1", user).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, "UPDATE users SET status='suspended' WHERE email=$1", user); err != nil {
		t.Fatal(err)
	}
	if _, err = svc.Authenticate(ctx, suspendedToken); err != auth.ErrUnauthorized {
		t.Fatalf("suspended session accepted: %v", err)
	}
	if _, _, err = svc.Login(ctx, user, password, "android"); err != auth.ErrInvalidCredentials {
		t.Fatalf("suspended login accepted: %v", err)
	}
	if err = svc.RevokeAll(ctx, userID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, "UPDATE users SET status='active' WHERE email=$1", user); err != nil {
		t.Fatal(err)
	}
	if _, err = svc.Authenticate(ctx, suspendedToken); err != auth.ErrUnauthorized {
		t.Fatalf("revoked session accepted: %v", err)
	}

	for i := 0; i < 5; i++ {
		if rec := login(admin, "bad", "admin", "127.0.0.9"); rec.Code != 401 {
			t.Fatalf("attempt %d: %d", i, rec.Code)
		}
	}
	if rec := login(admin, password, "admin", "127.0.0.9"); rec.Code != 429 {
		t.Fatalf("rate limit: %d %s", rec.Code, rec.Body)
	}
	now.now = now.now.Add(16 * time.Minute)
	if rec := login(admin, password, "admin", "127.0.0.9"); rec.Code != 200 {
		t.Fatalf("rate reset: %d %s", rec.Code, rec.Body)
	}
	expiredToken, _, err := svc.Login(ctx, user, password, "android")
	if err != nil {
		t.Fatal(err)
	}
	now.now = now.now.Add(14 * 24 * time.Hour)
	if _, err = svc.Authenticate(ctx, expiredToken); err != auth.ErrUnauthorized {
		t.Fatalf("expired session: %v", err)
	}

}
