package category

import (
	"errors"
	"time"
)

var ErrInvalid = errors.New("invalid category")

var ErrNotFound = errors.New("category not found")

var ErrInUse = errors.New("category is in use")

type Category struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
