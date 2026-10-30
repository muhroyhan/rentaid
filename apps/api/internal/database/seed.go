package database

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

func clockNow() time.Time { return (clock.System{}).Now().UTC() }

// Seed installs only local demo settings; admin credentials are added in Phase 02.
func Seed(ctx context.Context, pool *pgxpool.Pool, appEnv string) error {
	if strings.EqualFold(strings.TrimSpace(appEnv), "production") {
		return errors.New("local seed is disabled in production")
	}
	_, err := pool.Exec(ctx, `INSERT INTO app_settings (key, value, updated_at)
        VALUES ('instance_name', 'Rentaid Local', $1)
        ON CONFLICT (key) DO NOTHING`, clockNow())
	return err
}
