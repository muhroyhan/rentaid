package payment

import (
	"errors"
	"time"
)

var ErrDisabled = errors.New("simulator disabled")

var ErrInvalid = errors.New("invalid payment")

var ErrKeyReuse = errors.New("key reuse")

type Result struct {
	Status int
	Body   []byte
}

type Payment struct {
	ID          string    `json:"id"`
	OrderID     string    `json:"orderId"`
	OrderCode   string    `json:"orderCode"`
	ProductName string    `json:"productName"`
	StoreName   string    `json:"storeName"`
	Amount      int64     `json:"amount"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}

type VendorOrder struct {
	ID           string     `json:"id"`
	OrderCode    string     `json:"orderCode"`
	ProductName  string     `json:"productName"`
	StoreName    string     `json:"storeName"`
	RefundAmount int64      `json:"refundAmount"`
	ReturnedAt   *time.Time `json:"returnedAt,omitempty"`
	RenterName   string     `json:"renterName"`
	RenterPhone  string     `json:"renterPhone"`
	StartDate    string     `json:"startDate"`
	EndDate      string     `json:"endDate"`
	Quantity     int32      `json:"quantity"`
	Total        int64      `json:"total"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"createdAt"`
}
