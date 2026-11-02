package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"rentaid.local/api/internal/auth"
	"strconv"
)

func accountError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrInvalidProfile):
		errorJSON(w, 400, "invalid_profile", "Data pengguna tidak valid.")
	case errors.Is(err, auth.ErrEmailTaken):
		errorJSON(w, 409, "email_taken", "Email sudah terdaftar.")
	case errors.Is(err, auth.ErrForbidden):
		errorJSON(w, 404, "not_found", "Pengguna tidak ditemukan.")
	default:
		errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
	}
}
func registerAccounts(mux *http.ServeMux, svc *auth.Service, cfg AuthConfig) {
	mux.HandleFunc("POST /api/v1/auth/register", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Email    string `json:"email"`
			Password string `json:"password"`
			Name     string `json:"name"`
			Phone    string `json:"phone"`
			Client   string `json:"client"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		if in.Client != "android" {
			c, err := r.Cookie(loginCSRFCookie)
			if err != nil || !originAllowed(r, cfg.AllowedOrigins) || !sameToken(r.Header.Get("X-CSRF-Token"), c.Value) {
				errorJSON(w, 403, "csrf_rejected", "Permintaan ditolak.")
				return
			}
		}
		p, err := svc.Register(r.Context(), in.Email, in.Password, in.Name, in.Phone)
		if err != nil {
			accountError(w, err)
			return
		}
		writeJSON(w, 201, p)
	})
	mux.HandleFunc("GET /api/v1/profile", func(w http.ResponseWriter, r *http.Request) {
		_, session, ok := requestSession(w, r, svc, cfg)
		if !ok {
			return
		}
		if session.User.Role != "user" {
			errorJSON(w, 403, "forbidden", "Akses ditolak.")
			return
		}
		p, err := svc.Profile(r.Context(), session.User.ID)
		if err != nil {
			accountError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, p)
	})
	mux.HandleFunc("PUT /api/v1/profile", func(w http.ResponseWriter, r *http.Request) {
		_, session, ok := requestSession(w, r, svc, cfg)
		if !ok {
			return
		}
		if session.User.Role != "user" {
			errorJSON(w, 403, "forbidden", "Akses ditolak.")
			return
		}
		var in struct {
			Name  string `json:"name"`
			Phone string `json:"phone"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		p, err := svc.UpdateProfile(r.Context(), session.User.ID, in.Name, in.Phone)
		if err != nil {
			accountError(w, err)
			return
		}
		writeJSON(w, 200, p)
	})
	mux.HandleFunc("GET /api/v1/admin/users", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, svc, cfg) {
			return
		}
		page, size := 1, 20
		if v := r.URL.Query().Get("page"); v != "" {
			page, _ = strconv.Atoi(v)
		}
		if v := r.URL.Query().Get("page_size"); v != "" {
			size, _ = strconv.Atoi(v)
		}
		if page < 1 || size < 1 || size > 50 {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		users, err := svc.ListUsers(r.Context(), page, size)
		if err != nil {
			accountError(w, err)
			return
		}
		writeJSON(w, 200, users)
	})
	mux.HandleFunc("GET /api/v1/admin/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, svc, cfg) {
			return
		}
		p, err := svc.Profile(r.Context(), r.PathValue("id"))
		if err != nil {
			accountError(w, err)
			return
		}
		writeJSON(w, 200, p)
	})
	mux.HandleFunc("PUT /api/v1/admin/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, svc, cfg) {
			return
		}
		var in struct {
			Status string `json:"status"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		p, err := svc.SetUserStatus(r.Context(), r.PathValue("id"), in.Status)
		if err != nil {
			accountError(w, err)
			return
		}
		writeJSON(w, 200, p)
	})
}
