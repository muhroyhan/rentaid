package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/store"
	"strconv"
)

func storeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrInvalid):
		errorJSON(w, 400, "invalid_store", "Data toko atau alasan tidak valid.")
	case errors.Is(err, store.ErrNotFound):
		errorJSON(w, 404, "not_found", "Toko tidak ditemukan.")
	case errors.Is(err, store.ErrConflict):
		errorJSON(w, 409, "store_conflict", "Status toko tidak memungkinkan tindakan ini atau akun sudah memiliki toko.")
	default:
		errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
	}
}
func requireUser(w http.ResponseWriter, r *http.Request, accounts *auth.Service, cfg AuthConfig) (auth.Session, bool) {
	_, session, ok := requestSession(w, r, accounts, cfg)
	if !ok {
		return auth.Session{}, false
	}
	if session.User.Role != "user" {
		errorJSON(w, 403, "forbidden", "Akses ditolak.")
		return auth.Session{}, false
	}
	return session, true
}
func requireApprovedVendor(w http.ResponseWriter, r *http.Request, accounts *auth.Service, cfg AuthConfig) (auth.Session, bool) {
	session, ok := requireUser(w, r, accounts, cfg)
	if !ok {
		return auth.Session{}, false
	}
	stores := &store.Service{Pool: accounts.Pool, Clock: accounts.Clock}
	approved, err := stores.Approved(r.Context(), session.User.ID)
	if err != nil {
		errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
		return auth.Session{}, false
	}
	if !approved {
		errorJSON(w, 403, "store_not_approved", "Toko belum disetujui atau sedang ditangguhkan.")
		return auth.Session{}, false
	}
	return session, true
}
func registerStores(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, stores *store.Service) {
	mux.HandleFunc("GET /api/v1/vendor/dashboard", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		own, err := stores.Own(r.Context(), session.User.ID)
		if errors.Is(err, store.ErrNotFound) || (err == nil && own.Status != "approved") {
			errorJSON(w, 403, "store_not_approved", "Toko belum disetujui atau sedang ditangguhkan.")
			return
		}
		if err != nil {
			storeError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, own)
	})
	mux.HandleFunc("GET /api/v1/store", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		v, err := stores.Own(r.Context(), session.User.ID)
		if err != nil {
			storeError(w, err)
			return
		}
		writeJSON(w, 200, v)
	})
	mux.HandleFunc("GET /api/v1/store/history", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		own, err := stores.Own(r.Context(), session.User.ID)
		if err != nil {
			storeError(w, err)
			return
		}
		detail, err := stores.Detail(r.Context(), own.ID)
		if err != nil {
			storeError(w, err)
			return
		}
		writeJSON(w, 200, detail)
	})
	change := func(create bool) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			session, ok := requireUser(w, r, accounts, cfg)
			if !ok {
				return
			}
			var in store.Input
			if json.NewDecoder(r.Body).Decode(&in) != nil {
				errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
				return
			}
			var v store.Store
			var err error
			if create {
				v, err = stores.Create(r.Context(), session.User.ID, in)
			} else {
				v, err = stores.Resubmit(r.Context(), session.User.ID, in)
			}
			if err != nil {
				storeError(w, err)
				return
			}
			status := 200
			if create {
				status = 201
			}
			writeJSON(w, status, v)
		}
	}
	mux.HandleFunc("POST /api/v1/store", change(true))
	mux.HandleFunc("PUT /api/v1/store", change(false))
	mux.HandleFunc("GET /api/v1/admin/stores", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
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
		items, err := stores.List(r.Context(), page, size)
		if err != nil {
			storeError(w, err)
			return
		}
		writeJSON(w, 200, items)
	})
	mux.HandleFunc("GET /api/v1/admin/stores/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		v, err := stores.Detail(r.Context(), r.PathValue("id"))
		if err != nil {
			storeError(w, err)
			return
		}
		writeJSON(w, 200, v)
	})
	mux.HandleFunc("POST /api/v1/admin/stores/{id}/decision", func(w http.ResponseWriter, r *http.Request) {
		_, session, ok := requestSession(w, r, accounts, cfg)
		if !ok {
			return
		}
		if session.User.Role != "admin" {
			errorJSON(w, 403, "forbidden", "Akses ditolak.")
			return
		}
		var in struct {
			Action string `json:"action"`
			Reason string `json:"reason"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		v, err := stores.Decide(r.Context(), r.PathValue("id"), session.User.ID, in.Action, in.Reason)
		if err != nil {
			storeError(w, err)
			return
		}
		writeJSON(w, 200, v)
	})
}
