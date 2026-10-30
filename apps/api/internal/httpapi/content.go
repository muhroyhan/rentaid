package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/content"
)

type pageInput struct {
	Title   string  `json:"title"`
	Body    string  `json:"body"`
	ImageID *string `json:"imageId"`
}

func contentError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, content.ErrInvalid):
		errorJSON(w, 400, "invalid_content", "Konten atau gambar tidak valid.")
	case errors.Is(err, content.ErrTooLarge):
		errorJSON(w, 413, "file_too_large", "Ukuran gambar maksimal 5 MB.")
	case errors.Is(err, content.ErrNotFound):
		errorJSON(w, 404, "not_found", "Konten tidak ditemukan.")
	default:
		errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
	}
}
func requireAdmin(w http.ResponseWriter, r *http.Request, svc *auth.Service, cfg AuthConfig) bool {
	_, session, ok := requestSession(w, r, svc, cfg)
	if !ok {
		return false
	}
	if session.User.Role != "admin" {
		errorJSON(w, 403, "forbidden", "Akses ditolak.")
		return false
	}
	return true
}
func registerContent(mux *http.ServeMux, svc *auth.Service, cfg AuthConfig, pages *content.Service) {
	mux.HandleFunc("GET /api/v1/admin/content/{key}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, svc, cfg) {
			return
		}
		p, err := pages.Draft(r.Context(), r.PathValue("key"))
		if err != nil {
			contentError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, p)
	})
	mux.HandleFunc("PUT /api/v1/admin/content/{key}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, svc, cfg) {
			return
		}
		var input pageInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		p, err := pages.Save(r.Context(), content.Page{Key: r.PathValue("key"), Title: input.Title, Body: input.Body, ImageID: input.ImageID})
		if err != nil {
			contentError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, p)
	})
	mux.HandleFunc("POST /api/v1/admin/content/{key}/publish", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, svc, cfg) {
			return
		}
		p, err := pages.Publish(r.Context(), r.PathValue("key"))
		if err != nil {
			contentError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, p)
	})
	mux.HandleFunc("GET /api/v1/content/{key}", func(w http.ResponseWriter, r *http.Request) {
		p, err := pages.Public(r.Context(), r.PathValue("key"))
		if err != nil {
			contentError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, p)
	})
	mux.HandleFunc("POST /api/v1/admin/media", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, svc, cfg) {
			return
		}
		m, err := pages.Upload(r.Context(), r.Body)
		if err != nil {
			contentError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 201, m)
	})
	readMedia := func(public bool) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if !public && !requireAdmin(w, r, svc, cfg) {
				return
			}
			data, mime, err := pages.ReadMedia(r.Context(), r.PathValue("id"), public)
			if err != nil {
				contentError(w, err)
				return
			}
			w.Header().Set("Content-Type", mime)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
		}
	}
	mux.HandleFunc("GET /api/v1/admin/media/{id}", readMedia(false))
	mux.HandleFunc("GET /api/v1/media/{id}", readMedia(true))
}
