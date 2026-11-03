package httpapi

import (
	"errors"
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/order"
)

func registerOrderHistory(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, service *order.Service) {
	mux.HandleFunc("GET /api/v1/orders", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		page, size, ok := productPagination(r)
		status := r.URL.Query().Get("status")
		if !ok || !order.ValidStatus(status) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		items, err := service.ListRenter(r.Context(), session.User.ID, status, page, size)
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, items)
	})
	detail := func(scope string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			_, session, ok := requestSession(w, r, accounts, cfg)
			if !ok {
				return
			}
			if (scope == "admin" && session.User.Role != "admin") || (scope != "admin" && session.User.Role != "user") {
				errorJSON(w, 403, "forbidden", "Akses ditolak.")
				return
			}
			id := r.PathValue("id")
			if !productUUID.MatchString(id) {
				errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
				return
			}
			result, err := service.Detail(r.Context(), id, session.User.ID, scope)
			if errors.Is(err, order.ErrNotFound) {
				errorJSON(w, 404, "not_found", "Pesanan tidak ditemukan.")
				return
			}
			if err != nil {
				errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			writeJSON(w, 200, result)
		}
	}
	mux.HandleFunc("GET /api/v1/orders/{id}/detail", detail("renter"))
	mux.HandleFunc("GET /api/v1/vendor/orders/{id}", detail("vendor"))
	mux.HandleFunc("GET /api/v1/admin/orders/{id}", detail("admin"))
}
