package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/checkout"
)

func registerCheckout(mux *http.ServeMux, accounts *auth.Service, cfg AuthConfig, service *checkout.Service) {
	mux.HandleFunc("POST /api/v1/checkout", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		var in checkout.Input
		if json.NewDecoder(r.Body).Decode(&in) != nil || !productUUID.MatchString(in.ProductID) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		result, err := service.Create(r.Context(), session.User.ID, r.Header.Get("Idempotency-Key"), in)
		switch {
		case errors.Is(err, checkout.ErrInvalid):
			errorJSON(w, 400, "invalid_checkout", "Data checkout tidak valid.")
			return
		case errors.Is(err, checkout.ErrPhone):
			errorJSON(w, 400, "phone_required", "Lengkapi nomor telepon pada profil sebelum checkout.")
			return
		case errors.Is(err, checkout.ErrOwnProduct):
			errorJSON(w, 403, "own_product", "Anda tidak dapat menyewa produk toko sendiri.")
			return
		case errors.Is(err, checkout.ErrNotFound):
			errorJSON(w, 404, "not_found", "Produk tidak ditemukan.")
			return
		case errors.Is(err, checkout.ErrKeyReuse):
			errorJSON(w, 409, "idempotency_key_reuse", "Kunci checkout sudah digunakan untuk data yang berbeda.")
			return
		case err != nil:
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Date", accounts.Clock.Now().UTC().Format(http.TimeFormat))
		w.WriteHeader(result.Status)
		_, _ = w.Write(result.Body)
	})
	mux.HandleFunc("GET /api/v1/orders/{id}", func(w http.ResponseWriter, r *http.Request) {
		session, ok := requireUser(w, r, accounts, cfg)
		if !ok {
			return
		}
		id := r.PathValue("id")
		if !productUUID.MatchString(id) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		order, err := service.Get(r.Context(), session.User.ID, id)
		if errors.Is(err, checkout.ErrNotFound) {
			errorJSON(w, 404, "not_found", "Pesanan tidak ditemukan.")
			return
		}
		if err != nil {
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Date", accounts.Clock.Now().UTC().Format(http.TimeFormat))
		writeJSON(w, 200, order)
	})
}
