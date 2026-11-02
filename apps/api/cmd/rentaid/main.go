package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/clock"
	"rentaid.local/api/internal/content"
	"rentaid.local/api/internal/database"
	"rentaid.local/api/internal/httpapi"
)

func value(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func run(ctx context.Context, args []string, logger *slog.Logger) error {
	if len(args) != 1 || (args[0] != "serve" && args[0] != "migrate" && args[0] != "seed") {
		return errors.New("usage: rentaid serve|migrate|seed")
	}
	appEnv := value("APP_ENV", "local")
	if args[0] == "seed" && strings.EqualFold(strings.TrimSpace(appEnv), "production") {
		return errors.New("local seed is disabled in production")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return errors.New("invalid database configuration")
	}
	defer pool.Close()
	days, err := auth.ParsePositive(os.Getenv("SESSION_TTL_DAYS"), 14)
	if err != nil {
		return errors.New("invalid session TTL")
	}
	limit, err := auth.ParsePositive(os.Getenv("LOGIN_RATE_LIMIT"), 5)
	if err != nil {
		return errors.New("invalid login rate limit")
	}
	clk := clock.System{}
	svc := &auth.Service{Pool: pool, Clock: clk, TTL: time.Duration(days) * 24 * time.Hour}
	switch args[0] {
	case "migrate":
		return database.Migrate(ctx, pool)
	case "seed":
		if err := svc.SeedAdmin(ctx, os.Getenv("SEED_ADMIN_EMAIL"), os.Getenv("SEED_ADMIN_PASSWORD")); err != nil {
			return err
		}
		return database.Seed(ctx, pool, appEnv)
	}
	pages := &content.Service{Pool: pool, Clock: clk, Dir: value("MEDIA_DIR", "../../.artifacts/media")}
	handler, err := httpapi.NewWithContent(pool, logger, svc, httpapi.AuthConfig{SecureCookies: !strings.EqualFold(appEnv, "local"), AllowedOrigins: strings.Split(value("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081"), ","), Limiter: &auth.Limiter{Clock: clk, Max: limit, Window: 15 * time.Minute}}, pages)
	if err != nil {
		return fmt.Errorf("load API contract: %w", err)
	}
	server := &http.Server{
		Addr:              value("HTTP_ADDR", "127.0.0.1:8080"),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	serverError := make(chan error, 1)
	go func() { serverError <- server.Serve(listener) }()
	logger.Info("server started", "address", listener.Addr().String())
	select {
	case err = <-serverError:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err = server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown server: %w", err)
		}
		if err = <-serverError; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}
	return nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], logger); err != nil {
		// Do not expose database credentials or request secrets in logs.
		logger.Error("command failed", "reason", safeError(err))
		os.Exit(1)
	}
}

func safeError(err error) string {
	if strings.Contains(err.Error(), "usage:") || strings.Contains(err.Error(), "DATABASE_URL") || strings.Contains(err.Error(), "disabled in production") || strings.Contains(err.Error(), "seed admin email") || strings.Contains(err.Error(), "seed email belongs") {
		return err.Error()
	}
	return "operation failed; check configuration and service availability"
}
