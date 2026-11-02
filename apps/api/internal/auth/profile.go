package auth

import (
	"context"
	"errors"
	"net/mail"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrInvalidProfile = errors.New("invalid profile")
var ErrEmailTaken = errors.New("email taken")

type Profile struct {
	ID     string `json:"id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Phone  string `json:"phone"`
	Status string `json:"status"`
}

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
	err = s.Pool.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,status,created_at,name,phone)
        VALUES($1,$2,'user','active',$3,$4,$5) RETURNING id::text,email,name,phone,status`, email, hash, s.Clock.Now().UTC(), name, phone).Scan(&p.ID, &p.Email, &p.Name, &p.Phone, &p.Status)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Profile{}, ErrEmailTaken
	}
	return p, err
}

func (s *Service) Profile(ctx context.Context, id string) (Profile, error) {
	var p Profile
	err := s.Pool.QueryRow(ctx, `SELECT id::text,email,name,phone,status FROM users WHERE id=$1 AND role='user'`, id).Scan(&p.ID, &p.Email, &p.Name, &p.Phone, &p.Status)
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
	err := s.Pool.QueryRow(ctx, `UPDATE users SET name=$2,phone=$3 WHERE id=$1 AND role='user' RETURNING id::text,email,name,phone,status`, id, name, phone).Scan(&p.ID, &p.Email, &p.Name, &p.Phone, &p.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrForbidden
	}
	return p, err
}
