package payment

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func lockPaymentKey(ctx context.Context, db database.Executor, key string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, key)
}

func deleteExpiredPaymentKey(ctx context.Context, db database.Executor, user string, key string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `DELETE FROM idempotency_keys WHERE user_id=$1 AND endpoint='payment' AND key=$2 AND expires_at <= $3`, user, key, now)
}

func selectPaymentResult(ctx context.Context, db database.Executor, user string, key string, outSavedHash *[]byte, outStatus *int, outBody *[]byte) error {
	return db.QueryRow(ctx, `SELECT request_hash,response_status,response_body FROM idempotency_keys WHERE user_id=$1 AND endpoint='payment' AND key=$2`, user, key).Scan(outSavedHash, outStatus, outBody)
}

func savePaymentResult(ctx context.Context, db database.Executor, user string, key string, hash []byte, status int, body []byte, expiresAt time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO idempotency_keys(user_id,endpoint,key,request_hash,response_status,response_body,expires_at) VALUES($1,'payment',$2,$3,$4,$5,$6)`, user, key, hash, status, body, expiresAt)
}

func lockPaymentOrder(ctx context.Context, db database.Executor, orderID string, user string, outState *string, outOrderCode *string, outProductName *string, outStoreName *string, outHold *time.Time, outAmount *int64) error {
	return db.QueryRow(ctx, `SELECT status,order_code,product_name,store_name,hold_until,total FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE`, orderID, user).Scan(outState, outOrderCode, outProductName, outStoreName, outHold, outAmount)
}

func setPaymentOrderStatus(ctx context.Context, db database.Executor, orderID string, next string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE orders SET status=$2 WHERE id=$1 AND status='pending_payment'`, orderID, next)
}

func insertPaymentHistory(ctx context.Context, db database.Executor, orderID string, next string, user string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,actor_id,created_at) VALUES($1,'pending_payment',$2,$3,$4)`, orderID, next, user, now)
}

func insertPayment(ctx context.Context, db database.Executor, orderID string, amount int64, outcome string, now time.Time, outID *string) error {
	return db.QueryRow(ctx, `INSERT INTO payments(order_id,amount,status,created_at) VALUES($1,$2,$3,$4) RETURNING id::text`, orderID, amount, outcome, now).Scan(outID)
}

func listPayments(ctx context.Context, db database.Executor, size int, offset int64) (pgx.Rows, error) {
	return db.Query(ctx, paymentSelect+`ORDER BY p.created_at DESC,p.id DESC LIMIT $1 OFFSET $2`, size, offset)
}

func selectPayment(ctx context.Context, db database.Executor, id string) pgx.Row {
	return db.QueryRow(ctx, paymentSelect+`WHERE p.id=$1`, id)
}

func listOrders(ctx context.Context, db database.Executor, user any, status string, size int, offset int64) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT o.id::text,o.order_code,o.product_name,o.store_name,COALESCE((SELECT r.amount FROM refunds r JOIN payments pay ON pay.id=r.payment_id WHERE pay.order_id=o.id),0),u.name,u.phone,o.start_date,o.end_date,o.quantity,o.total,o.status,o.created_at,o.returned_at FROM orders o JOIN products p ON p.id=o.product_id JOIN stores s ON s.id=p.store_id JOIN users u ON u.id=o.user_id WHERE ($1::uuid IS NULL OR s.owner_id=$1::uuid) AND ($2='' OR o.status=$2) ORDER BY o.created_at DESC,o.id DESC LIMIT $3 OFFSET $4`, user, status, size, offset)
}

const paymentSelect = `SELECT p.id::text,p.order_id::text,o.order_code,o.product_name,o.store_name,p.amount,p.status,p.created_at FROM payments p JOIN orders o ON o.id=p.order_id `
