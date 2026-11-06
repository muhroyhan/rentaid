package auth

import (
	"context"
	"crypto/sha256"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
	TTL   time.Duration
}

// SeedAdmin is idempotent and never changes an existing password or promotes a user.
func (s *Service) SeedAdmin(ctx context.Context, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	parsed, parseErr := mail.ParseAddress(email)
	if parseErr != nil || parsed.Address != email || len(password) < 12 || len(password) > 1024 {
		return errors.New("seed admin email and a password of at least 12 characters are required")
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	_, err = insertAdmin(ctx, s.Pool, email, hash, s.Clock.Now().UTC())
	if err != nil {
		return err
	}
	var role string
	if err = selectAccountRole(ctx, s.Pool, email, &role); err != nil {
		return err
	}
	if role != "admin" {
		return errors.New("seed email belongs to a non-admin user")
	}
	return nil
}

func (s *Service) Login(ctx context.Context, email, password, client string) (string, Session, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if client != "admin" && client != "marketplace" && client != "android" {
		return "", Session{}, ErrForbidden
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", Session{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var user User
	var hash, status string
	err = selectLoginUser(ctx, tx, email, &user, &hash, &status)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", Session{}, err
	}
	if errors.Is(err, pgx.ErrNoRows) { // Equalize the expensive hash operation for unknown users.
		hash = "$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	}
	valid, verifyErr := VerifyPassword(hash, password)
	if verifyErr != nil || !valid || status != "active" {
		return "", Session{}, ErrInvalidCredentials
	}
	if (client == "admin" && user.Role != "admin") || (client != "admin" && user.Role != "user") {
		return "", Session{}, ErrForbidden
	}
	token, err := RandomToken()
	if err != nil {
		return "", Session{}, err
	}
	csrf, err := RandomToken()
	if err != nil {
		return "", Session{}, err
	}
	now := s.Clock.Now().UTC()
	expiry := now.Add(s.TTL)
	tokenHash := sha256.Sum256([]byte(token))
	_, err = insertSession(ctx, tx, user.ID, tokenHash[:], csrf, now, expiry)
	if err != nil {
		return "", Session{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", Session{}, err
	}
	return token, Session{User: user, CSRFToken: csrf, ExpiresAt: expiry}, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (Session, error) {
	hash := sha256.Sum256([]byte(token))
	var session Session
	err := selectSession(ctx, s.Pool, hash[:], s.Clock.Now().UTC(), &session)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrUnauthorized
	}
	return session, err
}

func (s *Service) Logout(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	_, err := deleteSession(ctx, s.Pool, hash[:])
	return err
}

// RevokeAll must be called when a user is suspended or changes their password.
func (s *Service) RevokeAll(ctx context.Context, userID string) error {
	_, err := deleteUserSessions(ctx, s.Pool, userID)
	return err
}
