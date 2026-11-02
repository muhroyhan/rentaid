package httpapi

import (
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/content"
	"rentaid.local/api/internal/store"
)

func registerVendorMedia(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, pages *content.Service) {
	stores := &store.Service{Pool: accounts.Pool, Clock: accounts.Clock}
	mux.HandleFunc("POST /api/v1/vendor/media", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		approved, err := stores.Approved(r.Context(), session.User.ID)
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		if !approved {
			errorJSON(w, 403, "store_not_approved", "Toko belum disetujui atau sedang ditangguhkan.")
			return
		}
		media, err := pages.UploadOwned(r.Context(), r.Body, &session.User.ID)
		if err != nil {
			contentError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 201, media)
	})
	mux.HandleFunc("GET /api/v1/vendor/media/{id}", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		data, mime, err := pages.ReadOwnedMedia(r.Context(), r.PathValue("id"), session.User.ID)
		if err != nil {
			contentError(w, err)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(200)
		_, _ = w.Write(data)
	})
}
