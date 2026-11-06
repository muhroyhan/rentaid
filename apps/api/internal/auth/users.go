package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

func (s *Service) ListUsers(ctx context.Context, page, size int) ([]Profile, error) {
	rows, err := listUsers(ctx, s.Pool, size, (page-1)*size)
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
	err = setUserStatus(ctx, tx, id, status, &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrForbidden
	}
	if err != nil {
		return Profile{}, err
	}
	if status == "suspended" {
		if _, err = revokeUserSessions(ctx, tx, id); err != nil {
			return Profile{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Profile{}, err
	}
	return p, nil
}
