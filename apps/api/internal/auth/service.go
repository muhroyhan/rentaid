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

var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrUnauthorized = errors.New("unauthorized")
var ErrForbidden = errors.New("forbidden")

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}
type Session struct {
	User      User      `json:"user"`
	CSRFToken string    `json:"csrfToken,omitempty"`
	ExpiresAt time.Time `json:"expiresAt"`
}
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
	_, err = s.Pool.Exec(ctx, `INSERT INTO users(email,password_hash,role,status,created_at)
        VALUES($1,$2,'admin','active',$3) ON CONFLICT(email) DO NOTHING`, email, hash, s.Clock.Now().UTC())
	if err != nil {
		return err
	}
	var role string
	if err = s.Pool.QueryRow(ctx, "SELECT role FROM users WHERE email=$1", email).Scan(&role); err != nil {
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
	var user User
	var hash, status string
	err := s.Pool.QueryRow(ctx, "SELECT id::text,email,password_hash,role,status FROM users WHERE email=$1", email).
		Scan(&user.ID, &user.Email, &hash, &user.Role, &status)
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
	_, err = s.Pool.Exec(ctx, `INSERT INTO sessions(user_id,token_hash,csrf_token,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5)`, user.ID, tokenHash[:], csrf, now, expiry)
	if err != nil {
		return "", Session{}, err
	}
	return token, Session{User: user, CSRFToken: csrf, ExpiresAt: expiry}, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (Session, error) {
	hash := sha256.Sum256([]byte(token))
	var session Session
	err := s.Pool.QueryRow(ctx, `SELECT u.id::text,u.email,u.role,s.csrf_token,s.expires_at
        FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.status='active'`, hash[:], s.Clock.Now().UTC()).
		Scan(&session.User.ID, &session.User.Email, &session.User.Role, &session.CSRFToken, &session.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrUnauthorized
	}
	return session, err
}

func (s *Service) Logout(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	_, err := s.Pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", hash[:])
	return err
}

// RevokeAll must be called when a user is suspended or changes their password.
func (s *Service) RevokeAll(ctx context.Context, userID string) error {
	_, err := s.Pool.Exec(ctx, "DELETE FROM sessions WHERE user_id=$1", userID)
	return err
}
