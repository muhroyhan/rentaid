package httpapi

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/legacy"
)

//go:embed openapi.json
var spec []byte

type Pinger interface{ Ping(context.Context) error }

type payload struct {
	Status  string `json:"status,omitempty"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, data payload) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// New validates the embedded contract at startup and validates documented request/response pairs.
func New(db Pinger, logger *slog.Logger) (http.Handler, error) {
	doc, err := openapi3.NewLoader().LoadFromData(spec)
	if err != nil {
		return nil, err
	}
	if err = doc.Validate(context.Background()); err != nil {
		return nil, err
	}
	router, err := legacy.NewRouter(doc)
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, payload{Status: "ok"})
	})
	mux.HandleFunc("GET /api/v1/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, payload{Code: "database_unavailable", Message: "Database belum tersedia."})
			return
		}
		writeJSON(w, http.StatusOK, payload{Status: "ok"})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		route, params, routeErr := router.FindRoute(r)
		if routeErr != nil {
			writeJSON(w, http.StatusNotFound, payload{Code: "not_found", Message: "Halaman tidak ditemukan."})
			return
		}
		requestInput := &openapi3filter.RequestValidationInput{Request: r, PathParams: params, Route: route}
		if err := openapi3filter.ValidateRequest(r.Context(), requestInput); err != nil {
			writeJSON(w, http.StatusBadRequest, payload{Code: "invalid_request", Message: "Permintaan tidak valid."})
			return
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, r)
		result := rec.Result()
		defer func() { _ = result.Body.Close() }()
		body, err := io.ReadAll(result.Body)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, payload{Code: "internal_error", Message: "Respons tidak tersedia."})
			return
		}
		responseInput := &openapi3filter.ResponseValidationInput{
			RequestValidationInput: requestInput, Status: result.StatusCode, Header: result.Header,
			Body:    io.NopCloser(bytes.NewReader(body)),
			Options: &openapi3filter.Options{IncludeResponseStatus: true},
		}
		if err = openapi3filter.ValidateResponse(r.Context(), responseInput); err != nil {
			logger.Error("response violates OpenAPI contract", "path", r.URL.Path)
			writeJSON(w, http.StatusInternalServerError, payload{Code: "internal_error", Message: "Respons tidak tersedia."})
			return
		}
		for key, values := range result.Header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		w.WriteHeader(result.StatusCode)
		if _, err = w.Write(body); err != nil && !errors.Is(err, context.Canceled) {
			logger.Warn("response write failed", "path", r.URL.Path)
		}
		logger.Info("request", "method", r.Method, "path", r.URL.Path, "status", result.StatusCode, "duration_ms", time.Since(started).Milliseconds())
	}), nil
}
