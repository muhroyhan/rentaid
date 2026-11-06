package checkout

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func lockCheckoutKey(ctx context.Context, db database.Executor, key string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, key)
}

func deleteExpiredCheckoutKey(ctx context.Context, db database.Executor, user string, key string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `DELETE FROM idempotency_keys WHERE user_id=$1 AND endpoint='checkout' AND key=$2 AND expires_at <= $3`, user, key, now)
}

func selectCheckoutResult(ctx context.Context, db database.Executor, user string, key string, outSavedHash *[]byte, outStatus *int, outBody *[]byte) error {
	return db.QueryRow(ctx, `SELECT request_hash,response_status,response_body FROM idempotency_keys WHERE user_id=$1 AND endpoint='checkout' AND key=$2`, user, key).Scan(outSavedHash, outStatus, outBody)
}

func saveCheckoutResult(ctx context.Context, db database.Executor, user string, key string, hash []byte, status int, body []byte, expiresAt time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO idempotency_keys(user_id,endpoint,key,request_hash,response_status,response_body,expires_at) VALUES($1,'checkout',$2,$3,$4,$5,$6)`, user, key, hash, status, body, expiresAt)
}

func selectRenterPhone(ctx context.Context, db database.Executor, user string, outPhone *string) error {
	return db.QueryRow(ctx, `SELECT phone FROM users WHERE id=$1 AND role='user' AND status='active'`, user).Scan(outPhone)
}

func lockCheckoutStore(ctx context.Context, db database.Executor, productID string, outOwner *string, outStoreName *string, outAddress *string, outStoreStatus *string) error {
	return db.QueryRow(ctx, `SELECT s.owner_id::text,s.name,s.address,s.status FROM stores s JOIN products p ON p.store_id=s.id WHERE p.id=$1 FOR SHARE OF s`, productID).Scan(outOwner, outStoreName, outAddress, outStoreStatus)
}

func lockCheckoutProduct(ctx context.Context, db database.Executor, productID string, outName *string, outPrice *int64, outStock *int32, outPublished *bool, outArchived *bool, outHidden *bool) error {
	return db.QueryRow(ctx, `SELECT name,daily_price,stock,published,archived,hidden FROM products WHERE id=$1 FOR UPDATE`, productID).Scan(outName, outPrice, outStock, outPublished, outArchived, outHidden)
}

func selectPeakUsage(ctx context.Context, db database.Executor, productID string, a time.Time, b time.Time, now time.Time, outUsed *int64) error {
	return db.QueryRow(ctx, `SELECT COALESCE(MAX(used),0) FROM (SELECT d.day,COALESCE(SUM(o.quantity),0) AS used FROM generate_series($2::date::timestamp,$3::date::timestamp,interval '1 day') d(day) LEFT JOIN orders o ON o.product_id=$1 AND o.start_date<=d.day::date AND o.end_date>=d.day::date AND (o.status IN ('confirmed','renting','completed') OR (o.status='pending_payment' AND o.hold_until>$4)) GROUP BY d.day) usage`, productID, a, b, now).Scan(outUsed)
}

func insertCheckoutOrder(ctx context.Context, db database.Executor, productID string, user string, orderCode string, name string, storeName string, address string, a time.Time, b time.Time, quantity int32, price int64, total int64, holdUntil time.Time, now time.Time, outID *string) error {
	return db.QueryRow(ctx, `INSERT INTO orders(product_id,user_id,order_code,product_name,store_name,store_address,start_date,end_date,quantity,daily_price,total,status,hold_until,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_payment',$12,$13) RETURNING id::text`, productID, user, orderCode, name, storeName, address, a, b, quantity, price, total, holdUntil, now).Scan(outID)
}

func insertCheckoutHistory(ctx context.Context, db database.Executor, id string, user string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO order_status_history(order_id,to_status,actor_id,created_at) VALUES($1,'pending_payment',$2,$3)`, id, user, now)
}

func selectRenterOrder(ctx context.Context, db database.Executor, id string, user string, outOrder *Order, outA *time.Time, outB *time.Time) error {
	return db.QueryRow(ctx, `SELECT id::text,order_code,product_id::text,product_name,store_name,store_address,start_date,end_date,quantity,daily_price,total,status,hold_until,created_at,COALESCE((SELECT r.amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=orders.id),0),returned_at FROM orders WHERE id=$1 AND user_id=$2`, id, user).Scan(&outOrder.ID, &outOrder.OrderCode, &outOrder.ProductID, &outOrder.ProductName, &outOrder.StoreName, &outOrder.StoreAddress, outA, outB, &outOrder.Quantity, &outOrder.DailyPrice, &outOrder.Total, &outOrder.Status, &outOrder.HoldUntil, &outOrder.CreatedAt, &outOrder.RefundAmount, &outOrder.ReturnedAt)
}
