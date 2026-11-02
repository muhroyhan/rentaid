package auth

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
)

func (s *Service) ListUsers(ctx context.Context, page, size int) ([]Profile, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id::text,email,name,phone,status FROM users WHERE role='user' ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`, size, (page-1)*size)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []Profile{}
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.Email, &p.Name, &p.Phone, &p.Status); err != nil {
			return nil, err
		}
		users = append(users, p)
	}
	return users, rows.Err()
}

func (s *Service) SetUserStatus(ctx context.Context, id, status string) (Profile, error) {
	if status != "active" && status != "suspended" {
		return Profile{}, ErrInvalidProfile
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Profile{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var p Profile
	err = tx.QueryRow(ctx, `UPDATE users SET status=$2 WHERE id=$1 AND role='user' RETURNING id::text,email,name,phone,status`, id, status).Scan(&p.ID, &p.Email, &p.Name, &p.Phone, &p.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrForbidden
	}
	if err != nil {
		return Profile{}, err
	}
	if status == "suspended" {
		if _, err = tx.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, id); err != nil {
			return Profile{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Profile{}, err
	}
	return p, nil
}
