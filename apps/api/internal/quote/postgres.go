package quote

import (
	"context"
	"time"

	"rentaid.local/api/internal/database"
)

func selectAvailability(ctx context.Context, db database.Executor, id string, a time.Time, b time.Time, now time.Time, outPrice *int64, outStock *int32, outPeak *int64) error {
	return db.QueryRow(ctx, `SELECT p.daily_price,p.stock,COALESCE((SELECT MAX(used) FROM (SELECT d.day, COALESCE(SUM(o.quantity),0) AS used FROM generate_series($2::date::timestamp,$3::date::timestamp,interval '1 day') AS d(day) LEFT JOIN orders o ON o.product_id=p.id AND o.start_date <= d.day::date AND o.end_date >= d.day::date AND (o.status IN ('confirmed','renting','completed') OR (o.status='pending_payment' AND o.hold_until > $4)) GROUP BY d.day) usage),0) FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=$1 AND p.published AND NOT p.archived AND NOT p.hidden AND s.status='approved'`, id, a, b, now).Scan(outPrice, outStock, outPeak)
}
