package httpapi

import (
	"errors"
	"net/http"
	"rentaid.local/api/internal/quote"
	"strconv"
)

func registerQuotes(mux *http.ServeMux, service *quote.Service) {
	mux.HandleFunc("GET /api/v1/products/{id}/quote", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !productUUID.MatchString(id) {
			errorJSON(w, 400, "invalid_request", "Permintaan tidak valid.")
			return
		}
		quantity, err := strconv.ParseInt(r.URL.Query().Get("quantity"), 10, 32)
		if err != nil {
			errorJSON(w, 400, "invalid_quote", "Tanggal atau jumlah sewa tidak valid.")
			return
		}
		q, err := service.Calculate(r.Context(), id, r.URL.Query().Get("start_date"), r.URL.Query().Get("end_date"), int32(quantity))
		switch {
		case errors.Is(err, quote.ErrInvalid):
			errorJSON(w, 400, "invalid_quote", "Tanggal atau jumlah sewa tidak valid.")
			return
		case errors.Is(err, quote.ErrUnavailable):
			errorJSON(w, 409, "stock_unavailable", "Stok tidak cukup untuk tanggal yang dipilih.")
			return
		case errors.Is(err, quote.ErrNotFound):
			errorJSON(w, 404, "not_found", "Produk tidak ditemukan.")
			return
		case err != nil:
			errorJSON(w, 500, "internal_error", "Layanan tidak tersedia.")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, q)
	})
}
