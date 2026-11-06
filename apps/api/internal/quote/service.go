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
	err = selectAvailability(ctx, s.Pool, id, a, b, now, &price, &stock, &peak)
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
