package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"rentaid.local/api/internal/auth"
)

const sessionCookie = "rentaid_session"
const loginCSRFCookie = "rentaid_login_csrf"

type AuthConfig struct {
	SecureCookies  bool
	AllowedOrigins []string
	Limiter        *auth.Limiter
}
type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Client   string `json:"client"`
}
type sessionResponse struct {
	auth.Session
	Token string `json:"token,omitempty"`
}

func originAllowed(r *http.Request, origins []string) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	for _, allowed := range origins {
		if origin == strings.TrimSpace(allowed) {
			return true
		}
	}
	return false
}
func sameToken(a, b string) bool {
	return a != "" && b != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func cookie(name, value string, maxAge int, secure bool) *http.Cookie {
	return &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge}
}
func errorJSON(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, payload{Code: code, Message: message})
}
func sessionToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer "), false
	}
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return "", true
	}
	return c.Value, true
}
func requestSession(w http.ResponseWriter, r *http.Request, svc *auth.Service, cfg AuthConfig) (string, auth.Session, bool) {
	token, browser := sessionToken(r)
	if token == "" {
		errorJSON(w, 401, "unauthorized", "Silakan masuk terlebih dahulu.")
		return "", auth.Session{}, false
	}
	session, err := svc.Authenticate(r.Context(), token)
	if errors.Is(err, auth.ErrUnauthorized) {
		errorJSON(w, 401, "unauthorized", "Sesi tidak berlaku. Silakan masuk kembali.")
		return "", auth.Session{}, false
	}
	if err != nil {
		errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
		return "", auth.Session{}, false
	}
	if browser && r.Method != http.MethodGet && r.Method != http.MethodHead {
		if !originAllowed(r, cfg.AllowedOrigins) || !sameToken(r.Header.Get("X-CSRF-Token"), session.CSRFToken) {
			errorJSON(w, 403, "csrf_rejected", "Permintaan ditolak.")
			return "", auth.Session{}, false
		}
	}
	if !browser {
		session.CSRFToken = ""
	}
	return token, session, true
}
func registerAuth(mux *http.ServeMux, svc *auth.Service, cfg AuthConfig) {
	mux.HandleFunc("GET /api/v1/auth/csrf", func(w http.ResponseWriter, _ *http.Request) {
		token, err := auth.RandomToken()
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		http.SetCookie(w, cookie(loginCSRFCookie, token, 600, cfg.SecureCookies))
		writeJSON(w, 200, map[string]string{"csrfToken": token})
	})
	mux.HandleFunc("POST /api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var input loginRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		browser := input.Client != "android"
		if browser {
			c, err := r.Cookie(loginCSRFCookie)
			if err != nil || !originAllowed(r, cfg.AllowedOrigins) || !sameToken(r.Header.Get("X-CSRF-Token"), c.Value) {
				errorJSON(w, 403, "csrf_rejected", "Permintaan ditolak.")
				return
			}
		}
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		if !cfg.Limiter.Allow(host) {
			errorJSON(w, 429, "rate_limited", "Terlalu banyak percobaan. Coba lagi nanti.")
			return
		}
		token, session, err := svc.Login(r.Context(), input.Email, input.Password, input.Client)
		if errors.Is(err, auth.ErrInvalidCredentials) {
			errorJSON(w, 401, "invalid_credentials", "Email atau kata sandi tidak benar.")
			return
		}
		if errors.Is(err, auth.ErrForbidden) {
			errorJSON(w, 403, "forbidden", "Akun tidak dapat masuk melalui aplikasi ini.")
			return
		}
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		cfg.Limiter.Reset(host)
		w.Header().Set("Cache-Control", "no-store")
		response := sessionResponse{Session: session}
		if browser {
			http.SetCookie(w, cookie(sessionCookie, token, int(svc.TTL/time.Second), cfg.SecureCookies))
			http.SetCookie(w, cookie(loginCSRFCookie, "", -1, cfg.SecureCookies))
		} else {
			response.CSRFToken = ""
			response.Token = token
		}
		writeJSON(w, 200, response)
	})
	mux.HandleFunc("GET /api/v1/auth/session", func(w http.ResponseWriter, r *http.Request) {
		_, session, ok := requestSession(w, r, svc, cfg)
		if !ok {
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, session)
	})
	mux.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		token, _, ok := requestSession(w, r, svc, cfg)
		if !ok {
			return
		}
		if err := svc.Logout(r.Context(), token); err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		http.SetCookie(w, cookie(sessionCookie, "", -1, cfg.SecureCookies))
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, payload{Status: "ok"})
	})
	mux.HandleFunc("GET /api/v1/admin/me", func(w http.ResponseWriter, r *http.Request) {
		_, session, ok := requestSession(w, r, svc, cfg)
		if !ok {
			return
		}
		if session.User.Role != "admin" {
			errorJSON(w, 403, "forbidden", "Akses ditolak.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, session.User)
	})
}
