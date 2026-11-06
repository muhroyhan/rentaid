package auth

import (
	"context"
	"errors"
	"net/mail"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Service) Register(ctx context.Context, email, password, name, phone string) (Profile, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	name, phone = strings.TrimSpace(name), strings.TrimSpace(phone)
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 254 || len(password) < 12 || len(password) > 1024 || name == "" || len(name) > 120 || len(phone) > 40 {
		return Profile{}, ErrInvalidProfile
	}
	hash, err := HashPassword(password)
	if err != nil {
		return Profile{}, err
	}
	var p Profile
	err = insertUser(ctx, s.Pool, email, hash, s.Clock.Now().UTC(), name, phone, &p)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Profile{}, ErrEmailTaken
	}
	return p, err
}

func (s *Service) Profile(ctx context.Context, id string) (Profile, error) {
	var p Profile
	err := selectProfile(ctx, s.Pool, id, &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrForbidden
	}
	return p, err
}

func (s *Service) UpdateProfile(ctx context.Context, id, name, phone string) (Profile, error) {
	name, phone = strings.TrimSpace(name), strings.TrimSpace(phone)
	if name == "" || len(name) > 120 || len(phone) > 40 {
		return Profile{}, ErrInvalidProfile
	}
	var p Profile
	err := updateProfile(ctx, s.Pool, id, name, phone, &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrForbidden
	}
	return p, err
}
