package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/category"
	"strconv"
)

func categoryError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, category.ErrInvalid):
		errorJSON(w, 400, "invalid_category", "Nama kategori tidak valid.")
	case errors.Is(err, category.ErrNotFound):
		errorJSON(w, 404, "not_found", "Kategori tidak ditemukan.")
	case errors.Is(err, category.ErrInUse):
		errorJSON(w, 409, "category_in_use", "Kategori masih digunakan produk.")
	default:
		errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
	}
}
func registerCategories(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, categories *category.Service) {
	mux.HandleFunc("GET /api/v1/categories", func(w http.ResponseWriter, r *http.Request) {
		page, size := 1, 20
		if v := r.URL.Query().Get("page"); v != "" {
			page, _ = strconv.Atoi(v)
		}
		if v := r.URL.Query().Get("page_size"); v != "" {
			size, _ = strconv.Atoi(v)
		}
		if page < 1 || size < 1 || size > 50 || int64(page-1) > (1<<62)/int64(size) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		items, err := categories.List(r.Context(), page, size)
		if err != nil {
			categoryError(w, err)
			return
		}
		writeJSON(w, 200, items)
	})
	mux.HandleFunc("POST /api/v1/admin/categories", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		var in struct {
			Name string `json:"name"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		v, err := categories.Create(r.Context(), in.Name)
		if err != nil {
			categoryError(w, err)
			return
		}
		writeJSON(w, 201, v)
	})
	mux.HandleFunc("PUT /api/v1/admin/categories/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		var in struct {
			Name string `json:"name"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		v, err := categories.Update(r.Context(), r.PathValue("id"), in.Name)
		if err != nil {
			categoryError(w, err)
			return
		}
		writeJSON(w, 200, v)
	})
	mux.HandleFunc("DELETE /api/v1/admin/categories/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		if err := categories.Delete(r.Context(), r.PathValue("id")); err != nil {
			categoryError(w, err)
			return
		}
		writeJSON(w, 200, payload{Status: "ok"})
	})
}
