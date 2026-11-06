package quote

import (
	"errors"
)

var ErrInvalid = errors.New("invalid rental parameters")

var ErrUnavailable = errors.New("stock unavailable")

var ErrNotFound = errors.New("product not found")

type Quote struct {
	ProductID  string `json:"productId"`
	StartDate  string `json:"startDate"`
	EndDate    string `json:"endDate"`
	Days       int    `json:"days"`
	Quantity   int32  `json:"quantity"`
	DailyPrice int64  `json:"dailyPrice"`
	Available  int32  `json:"available"`
	Total      int64  `json:"total"`
}
