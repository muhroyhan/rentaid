package database

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migrate applies immutable, ordered SQL migrations under a transaction lock.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin migration: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(726368923)"); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
	_, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version text NOT NULL UNIQUE,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL
    )`)
	if err != nil {
		return fmt.Errorf("create migration metadata: %w", err)
	}
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		script, readErr := migrations.ReadFile("migrations/" + name)
		if readErr != nil {
			return readErr
		}
		hash := sha256.Sum256(script)
		checksum := hex.EncodeToString(hash[:])
		var previous string
		err = tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE version=$1", name).Scan(&previous)
		if err == nil {
			if previous != checksum {
				return fmt.Errorf("migration %s was modified after application", name)
			}
			continue
		}
		if err != pgx.ErrNoRows {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if _, err = tx.Exec(ctx, string(script)); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES ($1, $2, $3)", name, checksum, clockNow()); err != nil {
			return fmt.Errorf("record migration %s: %w", name, err)
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migrations: %w", err)
	}
	return nil
}
