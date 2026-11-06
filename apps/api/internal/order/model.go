package order

import (
	"errors"
	"time"

	"rentaid.local/api/internal/checkout"
)

type Transaction struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	Amount    int64     `json:"amount"`
	CreatedAt time.Time `json:"createdAt"`
}

type Event struct {
	ID         string    `json:"id"`
	FromStatus *string   `json:"fromStatus"`
	ToStatus   string    `json:"toStatus"`
	ActorName  string    `json:"actorName"`
	ActorRole  string    `json:"actorRole"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Detail struct {
	Order       checkout.Order `json:"order"`
	Payment     *Transaction   `json:"payment,omitempty"`
	Refund      *Transaction   `json:"refund,omitempty"`
	History     []Event        `json:"history"`
	RenterName  string         `json:"renterName,omitempty"`
	RenterPhone string         `json:"renterPhone,omitempty"`
}

var ErrNotFound = errors.New("order not found")

var ErrInvalid = errors.New("invalid expected status")

var ErrOutsideWindow = errors.New("outside handover window")

type Conflict struct{ Status string }

type Cancellation struct {
	ID           string `json:"id"`
	Status       string `json:"status"`
	RefundAmount int64  `json:"refundAmount"`
}
