package order

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/database"
	"rentaid.local/api/internal/payment"
	"strings"
	"sync"
	"testing"
	"time"
)

type fixedClock struct{ now time.Time }

func (c *fixedClock) Now() time.Time { return c.now }
func TestCancellationIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not configured")
	}
	ctx := context.Background()
	base, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer base.Close()
	token, err := auth.RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	name := "phase13_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(token[:12]))
	schema := pgx.Identifier{name}.Sanitize()
	if _, err = base.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = base.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE") }()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 6, 0, 0, 0, 0, time.UTC)
	clk := &fixedClock{now}
	var owner, renter, other, admin, store, category, product string
	mkUser := func(email, role string) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,name,phone,created_at) VALUES($1,'x',$2,'User','0812',$3) RETURNING id::text`, email, role, now).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	owner = mkUser("owner@example.test", "user")
	renter = mkUser("renter@example.test", "user")
	other = mkUser("other@example.test", "user")
	admin = mkUser("admin@example.test", "admin")
	if err = pool.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,'Store','Address','0812','suspended',$2,$2) RETURNING id::text`, owner, now).Scan(&store); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES('Category',$1,$1) RETURNING id::text`, now).Scan(&category); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at) VALUES($1,$2,'Product','Description',10000,1,true,$3,$3) RETURNING id::text`, store, category, now).Scan(&product); err != nil {
		t.Fatal(err)
	}
	mkOrder := func(code, status string, hold time.Time) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO orders(product_id,user_id,order_code,product_name,store_name,store_address,start_date,end_date,quantity,daily_price,total,status,hold_until,created_at) VALUES($1,$2,$3,'Snapshot','Store','Address','2026-11-04','2026-11-05',1,10000,20000,$4,$5,$6) RETURNING id::text`, product, renter, code, status, hold, now).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	service := Service{Pool: pool, Clock: clk}
	sim := payment.Service{Pool: pool, Clock: clk, Enabled: true}
	pending := mkOrder("RNT-PENDING", "pending_payment", now.Add(time.Minute))
	if _, err = service.Cancel(ctx, pending, other, "user", "pending_payment"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unauthorized: %v", err)
	}
	result, err := service.Cancel(ctx, pending, owner, "user", "pending_payment")
	if err != nil || result.Status != "cancelled" || result.RefundAmount != 0 {
		t.Fatalf("pending cancel: %+v %v", result, err)
	}
	again, err := service.Cancel(ctx, pending, renter, "user", "pending_payment")
	if err != nil || again != result {
		t.Fatalf("repeat: %+v %v", again, err)
	}
	confirmed := mkOrder("RNT-CONFIRMED", "confirmed", now.Add(time.Minute))
	if _, err = pool.Exec(ctx, `INSERT INTO payments(order_id,amount,status,created_at) VALUES($1,20000,'succeeded',$2)`, confirmed, now); err != nil {
		t.Fatal(err)
	}
	result, err = service.Cancel(ctx, confirmed, admin, "admin", "confirmed")
	if err != nil || result.RefundAmount != 20000 {
		t.Fatalf("no-show refund: %+v %v", result, err)
	}
	result, err = service.Cancel(ctx, confirmed, admin, "admin", "confirmed")
	if err != nil || result.RefundAmount != 20000 {
		t.Fatalf("repeat refund: %+v %v", result, err)
	}
	var count int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1`, confirmed).Scan(&count); err != nil || count != 1 {
		t.Fatalf("refund count %d %v", count, err)
	}
	renting := mkOrder("RNT-RENTING", "renting", now.Add(time.Minute))
	var conflict *Conflict
	if _, err = service.Cancel(ctx, renting, renter, "user", "confirmed"); !errors.As(err, &conflict) || conflict.Status != "renting" {
		t.Fatalf("renting: %v", err)
	}
	expired := mkOrder("RNT-EXPIRED", "pending_payment", now)
	active := mkOrder("RNT-ACTIVE", "pending_payment", now.Add(time.Microsecond))
	restarted := Service{Pool: pool, Clock: clk}
	n, err := restarted.ExpireDue(ctx)
	if err != nil || n != 1 {
		t.Fatalf("cleanup %d %v", n, err)
	}
	var state string
	if err = pool.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1`, expired).Scan(&state); err != nil || state != "expired" {
		t.Fatalf("expiration %s %v", state, err)
	}
	if err = pool.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1`, active).Scan(&state); err != nil || state != "pending_payment" {
		t.Fatalf("early expiration %s %v", state, err)
	}
	clk.now = now.Add(time.Microsecond)
	n, err = restarted.ExpireDue(ctx)
	if err != nil || n != 1 {
		t.Fatalf("expiration boundary %d %v", n, err)
	}
	race := mkOrder("RNT-RACE", "pending_payment", now.Add(time.Minute))
	var wg sync.WaitGroup
	var cancelErr, payErr error
	var pay payment.Result
	wg.Add(2)
	go func() { defer wg.Done(); _, cancelErr = service.Cancel(ctx, race, renter, "user", "pending_payment") }()
	go func() { defer wg.Done(); pay, payErr = sim.Simulate(ctx, renter, race, "race", "succeeded") }()
	wg.Wait()
	if payErr != nil {
		t.Fatal(payErr)
	}
	if (cancelErr == nil && pay.Status != 409) || (cancelErr != nil && (!errors.As(cancelErr, &conflict) || pay.Status != 200)) {
		t.Fatalf("race cancel=%v payment=%+v", cancelErr, pay)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM order_status_history WHERE order_id=$1`, race).Scan(&count); err != nil || count != 1 {
		t.Fatalf("race history %d %v", count, err)
	}
	handover := mkOrder("RNT-HANDOVER", "confirmed", now.Add(time.Hour))
	if _, err = pool.Exec(ctx, `UPDATE orders SET start_date='2026-11-06',end_date='2026-11-07' WHERE id=$1`, handover); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Handover(ctx, handover, renter); !errors.Is(err, ErrNotFound) {
		t.Fatalf("renter handover: %v", err)
	}
	if _, err = service.Handover(ctx, handover, other); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other vendor handover: %v", err)
	}
	clk.now = time.Date(2026, 11, 5, 16, 59, 59, 0, time.UTC)
	if _, err = service.Handover(ctx, handover, owner); !errors.Is(err, ErrOutsideWindow) {
		t.Fatalf("before Jakarta start: %v", err)
	}
	clk.now = time.Date(2026, 11, 5, 17, 0, 0, 0, time.UTC)
	if state, err = service.Handover(ctx, handover, owner); err != nil || state != "renting" {
		t.Fatalf("handover: %s %v", state, err)
	}
	if state, err = service.Handover(ctx, handover, owner); err != nil || state != "renting" {
		t.Fatalf("repeated handover: %s %v", state, err)
	}
	var actorID string
	if err = pool.QueryRow(ctx, `SELECT count(*),max(actor_id::text) FROM order_status_history WHERE order_id=$1 AND from_status='confirmed' AND to_status='renting'`, handover).Scan(&count, &actorID); err != nil || count != 1 || actorID != owner {
		t.Fatalf("handover audit count=%d actor=%s err=%v", count, actorID, err)
	}
	if _, err = service.Cancel(ctx, handover, renter, "user", "confirmed"); !errors.As(err, &conflict) || conflict.Status != "renting" {
		t.Fatalf("cancel after handover: %v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE orders SET status='completed' WHERE id=$1`, handover); err != nil {
		t.Fatal(err)
	}
	if state, err = service.Handover(ctx, handover, owner); err != nil || state != "completed" {
		t.Fatalf("completed replay: %s %v", state, err)
	}
	last := mkOrder("RNT-END", "confirmed", now.Add(time.Hour))
	if _, err = pool.Exec(ctx, `UPDATE orders SET start_date='2026-11-06',end_date='2026-11-07' WHERE id=$1`, last); err != nil {
		t.Fatal(err)
	}
	clk.now = time.Date(2026, 11, 7, 16, 59, 59, 0, time.UTC)
	if state, err = service.Handover(ctx, last, owner); err != nil || state != "renting" {
		t.Fatalf("last day: %s %v", state, err)
	}
	after := mkOrder("RNT-AFTER", "confirmed", now.Add(time.Hour))
	if _, err = pool.Exec(ctx, `UPDATE orders SET start_date='2026-11-06',end_date='2026-11-07' WHERE id=$1`, after); err != nil {
		t.Fatal(err)
	}
	clk.now = time.Date(2026, 11, 7, 17, 0, 0, 0, time.UTC)
	if _, err = service.Handover(ctx, after, owner); !errors.Is(err, ErrOutsideWindow) {
		t.Fatalf("after Jakarta end: %v", err)
	}
	for _, invalid := range []struct{ id, status string }{{pending, "cancelled"}, {expired, "expired"}, {active, "expired"}} {
		if _, err = service.Handover(ctx, invalid.id, owner); !errors.As(err, &conflict) || conflict.Status != invalid.status {
			t.Fatalf("state %s: %v", invalid.status, err)
		}
	}
	unpaid := mkOrder("RNT-UNPAID", "pending_payment", now.Add(time.Hour))
	if _, err = service.Handover(ctx, unpaid, owner); !errors.As(err, &conflict) || conflict.Status != "pending_payment" {
		t.Fatalf("unpaid: %v", err)
	}

	simultaneous := mkOrder("RNT-HANDOVER-RACE", "confirmed", now.Add(time.Hour))
	if _, err = pool.Exec(ctx, `UPDATE orders SET start_date='2026-11-08',end_date='2026-11-08' WHERE id=$1`, simultaneous); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO payments(order_id,amount,status,created_at) VALUES($1,20000,'succeeded',$2)`, simultaneous, now); err != nil {
		t.Fatal(err)
	}
	var handErr, cancelRaceErr error
	wg.Add(2)
	go func() { defer wg.Done(); _, handErr = service.Handover(ctx, simultaneous, owner) }()
	go func() {
		defer wg.Done()
		_, cancelRaceErr = service.Cancel(ctx, simultaneous, renter, "user", "confirmed")
	}()
	wg.Wait()
	if handErr == nil {
		if !errors.As(cancelRaceErr, &conflict) || conflict.Status != "renting" {
			t.Fatalf("handover race cancellation: %v", cancelRaceErr)
		}
	} else {
		if cancelRaceErr != nil || !errors.As(handErr, &conflict) || conflict.Status != "cancelled" {
			t.Fatalf("handover race: hand=%v cancel=%v", handErr, cancelRaceErr)
		}
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM order_status_history WHERE order_id=$1`, simultaneous).Scan(&count); err != nil || count != 1 {
		t.Fatalf("handover race audit=%d %v", count, err)
	}

}
