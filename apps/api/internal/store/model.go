package store

import (
	"errors"
	"time"
)

var ErrInvalid = errors.New("invalid store")

var ErrNotFound = errors.New("store not found")

var ErrConflict = errors.New("store state conflict")

type Store struct {
	ID        string    `json:"id"`
	OwnerID   string    `json:"ownerId"`
	Name      string    `json:"name"`
	Address   string    `json:"address"`
	Phone     string    `json:"phone"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Decision struct {
	ActorID    string    `json:"actorId"`
	FromStatus *string   `json:"fromStatus"`
	ToStatus   string    `json:"toStatus"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Detail struct {
	Store   Store      `json:"store"`
	History []Decision `json:"history"`
}

type Input struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}
