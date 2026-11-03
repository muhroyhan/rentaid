package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/order"
	"rentaid.local/api/internal/payment"
)

func registerOrderActions(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, svc *order.Service, views *payment.Service) {
	mux.HandleFunc("POST /api/v1/vendor/orders/{id}/handover", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		id := r.PathValue("id")
		if !productUUID.MatchString(id) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		state, err := svc.Handover(r.Context(), id, session.User.ID)
		var conflict *order.Conflict
		switch {
		case errors.Is(err, order.ErrNotFound):
			errorJSON(w, 404, "not_found", "Pesanan tidak ditemukan.")
			return
		case errors.Is(err, order.ErrOutsideWindow):
			writeJSON(w, 409, map[string]string{"code": "order_conflict", "message": "Serah terima hanya dapat dilakukan pada tanggal sewa.", "currentStatus": "confirmed"})
			return
		case errors.As(err, &conflict):
			writeJSON(w, 409, map[string]string{"code": "order_conflict", "message": "Status pesanan tidak memungkinkan serah terima.", "currentStatus": conflict.Status})
			return
		case err != nil:
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, map[string]string{"id": id, "status": state})
	})
	mux.HandleFunc("POST /api/v1/orders/{id}/cancel", func(w http.ResponseWriter, r *http.Request) {
		_, session, ok := requestSession(w, r, accounts, cfg)
		if !ok {
			return
		}
		id := r.PathValue("id")
		var in struct {
			ExpectedStatus string `json:"expectedStatus"`
		}
		if !productUUID.MatchString(id) || json.NewDecoder(r.Body).Decode(&in) != nil {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		result, err := svc.Cancel(r.Context(), id, session.User.ID, session.User.Role, in.ExpectedStatus)
		var conflict *order.Conflict
		switch {
		case errors.Is(err, order.ErrNotFound):
			errorJSON(w, 404, "not_found", "Pesanan tidak ditemukan.")
			return
		case errors.Is(err, order.ErrInvalid):
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		case errors.As(err, &conflict):
			writeJSON(w, 409, map[string]string{"code": "order_conflict", "message": "Status pesanan telah berubah.", "currentStatus": conflict.Status})
			return
		case err != nil:
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, result)
	})
	mux.HandleFunc("GET /api/v1/admin/orders", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		page, size, ok := productPagination(r)
		if !ok {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		items, err := views.AdminOrders(r.Context(), page, size)
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, items)
	})
}
