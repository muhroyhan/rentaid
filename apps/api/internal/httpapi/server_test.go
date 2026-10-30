package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeDB struct{ err error }

func (d fakeDB) Ping(context.Context) error { return d.err }

func TestHealthAndReadiness(t *testing.T) {
	for _, tc := range []struct {
		path   string
		db     error
		status int
		body   string
	}{
		{"/api/v1/health", errors.New("offline"), http.StatusOK, "{\"status\":\"ok\"}\n"},
		{"/api/v1/ready", nil, http.StatusOK, "{\"status\":\"ok\"}\n"},
		{"/api/v1/ready", errors.New("offline"), http.StatusServiceUnavailable, "{\"code\":\"database_unavailable\",\"message\":\"Database belum tersedia.\"}\n"},
	} {
		t.Run(tc.path+http.StatusText(tc.status), func(t *testing.T) {
			handler, err := New(fakeDB{tc.db}, slog.New(slog.NewTextHandler(io.Discard, nil)))
			if err != nil {
				t.Fatal(err)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if rec.Code != tc.status || rec.Body.String() != tc.body {
				t.Fatalf("got status %d and body %q", rec.Code, rec.Body.String())
			}
		})
	}
}
