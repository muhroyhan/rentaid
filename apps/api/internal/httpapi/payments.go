package httpapi

import (
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/payment"
)

func registerPayments(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, svc *payment.Service) {
	mux.HandleFunc("POST /api/v1/payment-simulator", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		var in struct {
			OrderID string `json:"orderId"`
			Outcome string `json:"outcome"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil || !productUUID.MatchString(in.OrderID) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		result, err := svc.Simulate(r.Context(), session.User.ID, in.OrderID, r.Header.Get("Idempotency-Key"), in.Outcome)
		switch {
		case errors.Is(err, payment.ErrDisabled):
			errorJSON(w, 403, "simulator_disabled", "Simulator pembayaran tidak aktif.")
			return
		case errors.Is(err, payment.ErrInvalid):
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		case errors.Is(err, payment.ErrKeyReuse):
			errorJSON(w, 409, "idempotency_key_reuse", "Kunci pembayaran sudah digunakan untuk data yang berbeda.")
			return
		case err != nil:
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(result.Status)
		_, _ = w.Write(result.Body)
	})
	mux.HandleFunc("GET /api/v1/admin/payments", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		page, size, ok := productPagination(r)
		if !ok {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		items, err := svc.List(r.Context(), page, size)
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, items)
	})
	mux.HandleFunc("GET /api/v1/admin/payments/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r, accounts, cfg) {
			return
		}
		id := r.PathValue("id")
		if !productUUID.MatchString(id) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		item, err := svc.Get(r.Context(), id)
		if errors.Is(err, pgx.ErrNoRows) {
			errorJSON(w, 404, "not_found", "Transaksi tidak ditemukan.")
			return
		}
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, item)
	})
	mux.HandleFunc("GET /api/v1/vendor/orders", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		page, size, ok := productPagination(r)
		if !ok {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		items, err := svc.VendorOrders(r.Context(), session.User.ID, page, size)
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, items)
	})
}
