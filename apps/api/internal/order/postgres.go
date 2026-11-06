package order

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func listRenterOrders(ctx context.Context, db database.Executor, user string, status string, size int, offset int64) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT o.id::text,o.order_code,o.product_id::text,o.product_name,o.store_name,o.store_address,o.start_date,o.end_date,o.quantity,o.daily_price,o.total,COALESCE((SELECT r.amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=o.id),0),o.returned_at,o.status,o.hold_until,o.created_at FROM orders o WHERE o.user_id=$1 AND ($2='' OR o.status=$2) ORDER BY o.created_at DESC,o.id DESC LIMIT $3 OFFSET $4`, user, status, size, offset)
}

func selectOrderDetail(ctx context.Context, db database.Executor, id string, user string, scope string, outDetail *Detail, outStart *time.Time, outEnd *time.Time, outName *string, outPhone *string) error {
	return db.QueryRow(ctx, `SELECT o.id::text,o.order_code,o.product_id::text,o.product_name,o.store_name,o.store_address,o.start_date,o.end_date,o.quantity,o.daily_price,o.total,COALESCE((SELECT r.amount FROM refunds r JOIN payments pay ON pay.id=r.payment_id WHERE pay.order_id=o.id),0),o.returned_at,o.status,o.hold_until,o.created_at,u.name,u.phone FROM orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id JOIN stores st ON st.id=p.store_id WHERE o.id=$1 AND ($3='admin' OR ($3='renter' AND o.user_id=$2::uuid) OR ($3='vendor' AND st.owner_id=$2::uuid))`, id, user, scope).Scan(&outDetail.Order.ID, &outDetail.Order.OrderCode, &outDetail.Order.ProductID, &outDetail.Order.ProductName, &outDetail.Order.StoreName, &outDetail.Order.StoreAddress, outStart, outEnd, &outDetail.Order.Quantity, &outDetail.Order.DailyPrice, &outDetail.Order.Total, &outDetail.Order.RefundAmount, &outDetail.Order.ReturnedAt, &outDetail.Order.Status, &outDetail.Order.HoldUntil, &outDetail.Order.CreatedAt, outName, outPhone)
}

func selectPayment(ctx context.Context, db database.Executor, id string, outTransaction *Transaction) error {
	return db.QueryRow(ctx, `SELECT id::text,status,amount,created_at FROM payments WHERE order_id=$1`, id).Scan(&outTransaction.ID, &outTransaction.Status, &outTransaction.Amount, &outTransaction.CreatedAt)
}

func selectRefund(ctx context.Context, db database.Executor, id string, outTransaction *Transaction) error {
	return db.QueryRow(ctx, `SELECT r.id::text,r.status,r.amount,r.created_at FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1`, id).Scan(&outTransaction.ID, &outTransaction.Status, &outTransaction.Amount, &outTransaction.CreatedAt)
}

func listOrderHistory(ctx context.Context, db database.Executor, id string) (pgx.Rows, error) {
	return db.Query(ctx, `SELECT h.id::text,h.from_status,h.to_status,CASE WHEN h.actor_id IS NULL THEN 'Sistem' WHEN u.role='admin' THEN 'Admin' ELSE COALESCE(NULLIF(u.name,''),'Pengguna') END,CASE WHEN h.actor_id IS NULL THEN 'system' ELSE u.role END,h.created_at FROM order_status_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.order_id=$1 ORDER BY h.created_at,h.id`, id)
}

func lockOrderForCancellation(ctx context.Context, db database.Executor, id string, outState *string, outRenter *string, outOwner *string, outHold *time.Time) error {
	return db.QueryRow(ctx, `SELECT o.status,o.user_id::text,s.owner_id::text,o.hold_until FROM orders o JOIN products p ON p.id=o.product_id JOIN stores s ON s.id=p.store_id WHERE o.id=$1 FOR UPDATE OF o`, id).Scan(outState, outRenter, outOwner, outHold)
}

func selectRefundAmount(ctx context.Context, db database.Executor, id string, outRefundAmount *int64) error {
	return db.QueryRow(ctx, `SELECT COALESCE((SELECT r.amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1),0)`, id).Scan(outRefundAmount)
}

func expireOrder(ctx context.Context, db database.Executor, id string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE orders SET status='expired' WHERE id=$1 AND status='pending_payment'`, id)
}

func insertExpirationHistory(ctx context.Context, db database.Executor, id string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,created_at) VALUES($1,'pending_payment','expired',$2)`, id, now)
}

func selectSuccessfulPayment(ctx context.Context, db database.Executor, id string, outPaymentID *string, outRefundAmount *int64) error {
	return db.QueryRow(ctx, `SELECT id::text,amount FROM payments WHERE order_id=$1 AND status='succeeded' FOR UPDATE`, id).Scan(outPaymentID, outRefundAmount)
}

func insertRefund(ctx context.Context, db database.Executor, paymentID string, refundAmount int64, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO refunds(payment_id,amount,status,created_at) VALUES($1,$2,'succeeded',$3)`, paymentID, refundAmount, now)
}

func cancelOrder(ctx context.Context, db database.Executor, id string, state string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE orders SET status='cancelled' WHERE id=$1 AND status=$2`, id, state)
}

func insertCancellationHistory(ctx context.Context, db database.Executor, id string, state string, actor string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,actor_id,created_at) VALUES($1,$2,'cancelled',$3,$4)`, id, state, actor, now)
}

func expireDueOrders(ctx context.Context, db database.Executor, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `WITH due AS (SELECT id FROM orders WHERE status='pending_payment' AND hold_until <= $1 ORDER BY hold_until,id LIMIT 200 FOR UPDATE SKIP LOCKED), changed AS (UPDATE orders o SET status='expired' FROM due WHERE o.id=due.id AND o.status='pending_payment' RETURNING o.id) INSERT INTO order_status_history(order_id,from_status,to_status,created_at) SELECT id,'pending_payment','expired',$1 FROM changed`, now)
}

func lockOrderForHandover(ctx context.Context, db database.Executor, id string, actor string, outState *string, outStart *time.Time, outEnd *time.Time) error {
	return db.QueryRow(ctx, `SELECT o.status,o.start_date,o.end_date FROM orders o JOIN products p ON p.id=o.product_id JOIN stores st ON st.id=p.store_id WHERE o.id=$1 AND st.owner_id=$2 FOR UPDATE OF o`, id, actor).Scan(outState, outStart, outEnd)
}

func hasHandoverHistory(ctx context.Context, db database.Executor, id string, outHanded *bool) error {
	return db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM order_status_history WHERE order_id=$1 AND from_status='confirmed' AND to_status='renting')`, id).Scan(outHanded)
}

func markRenting(ctx context.Context, db database.Executor, id string) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE orders SET status='renting' WHERE id=$1 AND status='confirmed'`, id)
}

func insertHandoverHistory(ctx context.Context, db database.Executor, id string, actor string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,actor_id,created_at) VALUES($1,'confirmed','renting',$2,$3)`, id, actor, now)
}

func lockOrderForReturn(ctx context.Context, db database.Executor, id string, actor string, outState *string, outReturned **time.Time) error {
	return db.QueryRow(ctx, `SELECT o.status,o.returned_at FROM orders o JOIN products p ON p.id=o.product_id JOIN stores st ON st.id=p.store_id WHERE o.id=$1 AND st.owner_id=$2 FOR UPDATE OF o`, id, actor).Scan(outState, outReturned)
}

func markCompleted(ctx context.Context, db database.Executor, id string, now time.Time, outSaved *time.Time) error {
	return db.QueryRow(ctx, `UPDATE orders SET status='completed',returned_at=$2 WHERE id=$1 AND status='renting' RETURNING returned_at`, id, now).Scan(outSaved)
}

func insertReturnHistory(ctx context.Context, db database.Executor, id string, actor string, saved time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO order_status_history(order_id,from_status,to_status,actor_id,created_at) VALUES($1,'renting','completed',$2,$3)`, id, actor, saved)
}
