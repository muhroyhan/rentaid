package demo

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"rentaid.local/api/internal/auth"
	"strings"
)

// Seed inserts fixture owners and stores atomically without modifying existing accounts.
func Seed(ctx context.Context, svc *auth.Service, adminEmail, password string) error {
	if len(password) < 12 || len(password) > 1024 {
		return errors.New("demo password must contain at least 12 characters")
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := svc.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var admin string
	if err = tx.QueryRow(ctx, `SELECT id::text FROM users WHERE email=$1 AND role='admin'`, strings.ToLower(strings.TrimSpace(adminEmail))).Scan(&admin); err != nil {
		return err
	}
	now := svc.Clock.Now().UTC()
	for _, status := range []string{"pending", "approved", "rejected", "suspended"} {
		email := "demo." + status + "@example.test"
		var owner string
		err = tx.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,status,created_at,name,phone) VALUES($1,$2,'user','active',$3,$4,'081234567890') ON CONFLICT(email) DO NOTHING RETURNING id::text`, email, hash, now, "Demo "+status).Scan(&owner)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		var id string
		if err = tx.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,$2,'Jakarta','081234567890',$3,$4,$4) RETURNING id::text`, owner, "Toko Demo "+status, status, now).Scan(&id); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,to_status,created_at) VALUES($1,$2,'pending',$3)`, id, owner, now); err != nil {
			return err
		}
		switch status {
		case "approved", "rejected":
			if _, err = tx.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,from_status,to_status,reason,created_at) VALUES($1,$2,'pending',$3,$4,$5)`, id, admin, status, seedReason(status), now); err != nil {
				return err
			}
		case "suspended":
			if _, err = tx.Exec(ctx, `INSERT INTO store_status_history(store_id,actor_id,from_status,to_status,reason,created_at) VALUES($1,$2,'pending','approved','',$3),($1,$2,'approved','suspended','Data demo',$3)`, id, admin, now); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}
func seedReason(status string) string {
	if status == "rejected" {
		return "Data demo"
	}
	return ""
}
