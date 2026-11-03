package quote

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"rentaid.local/api/internal/clock"
)

const MaxDays = 30
const maxSafeInteger int64 = 9007199254740991

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
type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
}

func Dates(start, end string, now time.Time) (time.Time, time.Time, int, error) {
	a, err := time.Parse("2006-01-02", start)
	if err != nil || a.Format("2006-01-02") != start {
		return time.Time{}, time.Time{}, 0, ErrInvalid
	}
	b, err := time.Parse("2006-01-02", end)
	if err != nil || b.Format("2006-01-02") != end {
		return time.Time{}, time.Time{}, 0, ErrInvalid
	}
	loc, err := clock.Jakarta()
	if err != nil {
		return time.Time{}, time.Time{}, 0, err
	}
	today := now.In(loc).Format("2006-01-02")
	days := int(b.Sub(a).Hours()/24) + 1
	if start < today || b.Before(a) || days > MaxDays {
		return time.Time{}, time.Time{}, 0, ErrInvalid
	}
	return a, b, days, nil
}

func (s *Service) Calculate(ctx context.Context, id, start, end string, quantity int32) (Quote, error) {
	now := s.Clock.Now()
	a, b, days, err := Dates(start, end, now)
	if err != nil {
		return Quote{}, err
	}
	if quantity < 1 {
		return Quote{}, ErrInvalid
	}
	var price int64
	var stock int32
	var peak int64
	err = s.Pool.QueryRow(ctx, `SELECT p.daily_price,p.stock,COALESCE((SELECT MAX(used) FROM (SELECT d.day, COALESCE(SUM(o.quantity),0) AS used FROM generate_series($2::date::timestamp,$3::date::timestamp,interval '1 day') AS d(day) LEFT JOIN orders o ON o.product_id=p.id AND o.start_date <= d.day::date AND o.end_date >= d.day::date AND (o.status IN ('confirmed','renting') OR (o.status='pending_payment' AND o.hold_until > $4)) GROUP BY d.day) usage),0) FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=$1 AND p.published AND NOT p.archived AND NOT p.hidden AND s.status='approved'`, id, a, b, now).Scan(&price, &stock, &peak)
	if errors.Is(err, pgx.ErrNoRows) {
		return Quote{}, ErrNotFound
	}
	if err != nil {
		return Quote{}, err
	}
	if quantity > stock {
		return Quote{}, ErrInvalid
	}
	available := int64(stock) - peak
	if available < 0 {
		available = 0
	}
	if int64(quantity) > available {
		return Quote{}, ErrUnavailable
	}
	factor := int64(days) * int64(quantity)
	if price > maxSafeInteger/factor {
		return Quote{}, ErrInvalid
	}
	return Quote{ProductID: id, StartDate: start, EndDate: end, Days: days, Quantity: quantity, DailyPrice: price, Available: int32(available), Total: price * factor}, nil
}
