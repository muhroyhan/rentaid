package checkout

import (
	"errors"
	"time"
)

var ErrInvalid = errors.New("invalid checkout")

var ErrPhone = errors.New("phone required")

var ErrOwnProduct = errors.New("own product")

var ErrNotFound = errors.New("not found")

var ErrKeyReuse = errors.New("idempotency key reused")

type Input struct {
	ProductID         string `json:"productId"`
	StartDate         string `json:"startDate"`
	EndDate           string `json:"endDate"`
	Quantity          int32  `json:"quantity"`
	ExpectedTotal     int64  `json:"expectedTotal"`
	ExpectedAvailable int32  `json:"expectedAvailable"`
}

type Order struct {
	ID           string     `json:"id"`
	OrderCode    string     `json:"orderCode"`
	ProductID    string     `json:"productId"`
	ProductName  string     `json:"productName"`
	StoreName    string     `json:"storeName"`
	StoreAddress string     `json:"storeAddress"`
	StartDate    string     `json:"startDate"`
	EndDate      string     `json:"endDate"`
	Quantity     int32      `json:"quantity"`
	DailyPrice   int64      `json:"dailyPrice"`
	Total        int64      `json:"total"`
	RefundAmount int64      `json:"refundAmount"`
	ReturnedAt   *time.Time `json:"returnedAt,omitempty"`
	Status       string     `json:"status"`
	HoldUntil    time.Time  `json:"holdUntil"`
	CreatedAt    time.Time  `json:"createdAt"`
}

type Result struct {
	Status int
	Body   []byte
}
