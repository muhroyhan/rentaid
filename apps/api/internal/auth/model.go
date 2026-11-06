package auth

import (
	"errors"
	"time"
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
