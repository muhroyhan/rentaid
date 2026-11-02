package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/product"
	"strconv"
)

func productError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, product.ErrInvalid):
		errorJSON(w, 400, "invalid_product", "Data produk tidak valid.")
	case errors.Is(err, product.ErrNotFound):
		errorJSON(w, 404, "not_found", "Produk tidak ditemukan.")
	case errors.Is(err, product.ErrForbidden):
		errorJSON(w, 403, "store_not_approved", "Toko belum disetujui atau sedang ditangguhkan.")
	case errors.Is(err, product.ErrConflict):
		errorJSON(w, 409, "product_conflict", "Status produk tidak memungkinkan tindakan ini.")
	default:
		errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
	}
}
func productPagination(r *http.Request) (int, int, bool) {
	page, size := 1, 20
	if v := r.URL.Query().Get("page"); v != "" {
		page, _ = strconv.Atoi(v)
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		size, _ = strconv.Atoi(v)
	}
	return page, size, page > 0 && size > 0 && size <= 50 && int64(page-1) <= (1<<62)/int64(size)
}
func registerProducts(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, products *product.Service) {
	list := func(scope string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			owner := ""
			if scope == "admin" && !requireAdmin(w, r, accounts, cfg) {
				return
			}
			if scope == "vendor" {
				session, ok := requireApprovedVendor(w, r, accounts, cfg)
				if !ok {
					return
				}
				owner = session.User.ID
			}
			page, size, ok := productPagination(r)
			if !ok {
				errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
				return
			}
			v, err := products.List(r.Context(), scope, owner, page, size)
			if err != nil {
				productError(w, err)
				return
			}
			writeJSON(w, 200, v)
		}
	}
	get := func(scope string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			owner := ""
			if scope == "vendor" {
				session, ok := requireApprovedVendor(w, r, accounts, cfg)
				if !ok {
					return
				}
				owner = session.User.ID
			}
			v, err := products.Get(r.Context(), r.PathValue("id"), scope, owner)
			if err != nil {
				productError(w, err)
				return
			}
			writeJSON(w, 200, v)
		}
	}
	mux.HandleFunc("GET /api/v1/products", list("public"))
	mux.HandleFunc("GET /api/v1/products/{id}", get("public"))
	mux.HandleFunc("GET /api/v1/vendor/products", list("vendor"))
	mux.HandleFunc("GET /api/v1/vendor/products/{id}", get("vendor"))
	mux.HandleFunc("GET /api/v1/admin/products", list("admin"))
	change := func(create bool) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			session, ok := requireUser(w, r, accounts, cfg)
			if !ok {
				return
			}
			var in product.Input
			if json.NewDecoder(r.Body).Decode(&in) != nil {
				errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
				return
			}
			var p product.Product
			var err error
			if create {
				p, err = products.Create(r.Context(), session.User.ID, in)
			} else {
				p, err = products.Update(r.Context(), session.User.ID, r.PathValue("id"), in)
			}
			if err != nil {
				productError(w, err)
				return
			}
			status := 200
			if create {
				status = 201
			}
			writeJSON(w, status, p)
		}
	}
	mux.HandleFunc("POST /api/v1/vendor/products", change(true))
	mux.HandleFunc("PUT /api/v1/vendor/products/{id}", change(false))
	state := func(action string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			session, ok := requireUser(w, r, accounts, cfg)
			if !ok {
				return
			}
			var in struct {
				Value bool `json:"value"`
			}
			if json.NewDecoder(r.Body).Decode(&in) != nil {
				errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
				return
			}
			p, err := products.ChangeState(r.Context(), session.User.ID, r.PathValue("id"), action, in.Value)
			if err != nil {
				productError(w, err)
				return
			}
			writeJSON(w, 200, p)
		}
	}
	mux.HandleFunc("PUT /api/v1/vendor/products/{id}/publication", state("publish"))
	mux.HandleFunc("PUT /api/v1/vendor/products/{id}/archive", state("archive"))
	mux.HandleFunc("GET /api/v1/admin/products/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		v, err := products.Detail(r.Context(), r.PathValue("id"))
		if err != nil {
			productError(w, err)
			return
		}
		writeJSON(w, 200, v)
	})
	mux.HandleFunc("POST /api/v1/admin/products/{id}/moderation", func(w http.ResponseWriter, r *http.Request) {
		_, session, ok := requestSession(w, r, accounts, cfg)
		if !ok {
			return
		}
		if session.User.Role != "admin" {
			errorJSON(w, 403, "forbidden", "Akses ditolak.")
			return
		}
		var in struct {
			Hidden bool   `json:"hidden"`
			Reason string `json:"reason"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		p, err := products.Moderate(r.Context(), r.PathValue("id"), session.User.ID, in.Hidden, in.Reason)
		if err != nil {
			productError(w, err)
			return
		}
		writeJSON(w, 200, p)
	})
}
