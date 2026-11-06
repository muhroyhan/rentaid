//go:build integration

package payment

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/database"
	"rentaid.local/api/internal/quote"
	"strings"
	"sync"
	"testing"
	"time"
)

type testClock struct{ now time.Time }

func (c *testClock) Now() time.Time { return c.now }
func TestPaymentsIntegration(t *testing.T) {
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
	name := "phase12_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(token[:12]))
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
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	clk := &testClock{now}
	var owner, renter, other, store, category, product string
	makeUser := func(email string) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,name,phone,created_at) VALUES($1,'x','user','Test','0812',$2) RETURNING id::text`, email, now).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	owner = makeUser("owner@example.test")
	renter = makeUser("renter@example.test")
	other = makeUser("other@example.test")
	if err = pool.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,'Store','Address','0812','approved',$2,$2) RETURNING id::text`, owner, now).Scan(&store); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES('Category',$1,$1) RETURNING id::text`, now).Scan(&category); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at) VALUES($1,$2,'Product','Description',99999,1,true,$3,$3) RETURNING id::text`, store, category, now).Scan(&product); err != nil {
		t.Fatal(err)
	}
	makeOrder := func(code string, hold time.Time) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO orders(product_id,user_id,order_code,product_name,store_name,store_address,start_date,end_date,quantity,daily_price,total,status,hold_until,created_at) VALUES($1,$2,$3,'Snapshot','Store','Address','2026-11-04','2026-11-05',1,10000,20000,'pending_payment',$4,$5) RETURNING id::text`, product, renter, code, hold, now).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	order := makeOrder("RNT-SUCCESS", now.Add(15*time.Minute))
	svc := Service{Pool: pool, Clock: clk, Enabled: true}
	disabled := Service{Pool: pool, Clock: clk}
	if _, e := disabled.Simulate(ctx, renter, order, "off", "succeeded"); !errors.Is(e, ErrDisabled) {
		t.Fatalf("disabled: %v", e)
	}
	if result, e := svc.Simulate(ctx, other, order, "other", "succeeded"); e != nil || result.Status != 404 {
		t.Fatalf("other user: %+v %v", result, e)
	}
	var results [2]Result
	var errs [2]error
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = svc.Simulate(ctx, renter, order, "same", "succeeded")
		}(i)
	}
	wg.Wait()
	var a, b Payment
	if errs[0] != nil || errs[1] != nil || results[0].Status != 200 || results[1].Status != 200 || json.Unmarshal(results[0].Body, &a) != nil || json.Unmarshal(results[1].Body, &b) != nil || a.ID != b.ID || a.Amount != 20000 {
		t.Fatalf("idempotency: %+v %v", results, errs)
	}
	if _, e := svc.Simulate(ctx, renter, order, "same", "failed"); !errors.Is(e, ErrKeyReuse) {
		t.Fatalf("key reuse: %v", e)
	}
	if result, e := svc.Simulate(ctx, renter, order, "different", "failed"); e != nil || result.Status != 409 || !strings.Contains(string(result.Body), `"confirmed"`) {
		t.Fatalf("status conflict: %+v %v", result, e)
	}
	var count int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE order_id=$1`, order).Scan(&count); err != nil || count != 1 {
		t.Fatalf("payment count=%d %v", count, err)
	}
	items, err := svc.VendorOrders(ctx, owner, "", 1, 20)
	if err != nil || len(items) != 1 || items[0].RenterPhone != "0812" {
		t.Fatalf("vendor: %+v %v", items, err)
	}
	otherItems, err := svc.VendorOrders(ctx, other, "", 1, 20)
	if err != nil || len(otherItems) != 0 {
		t.Fatalf("vendor isolation: %+v %v", otherItems, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE orders SET status='cancelled' WHERE id=$1`, order); err != nil {
		t.Fatal(err)
	}
	for _, outcome := range []string{"failed", "expired"} {
		id := makeOrder("RNT-"+outcome, now.Add(time.Minute))
		res, e := svc.Simulate(ctx, renter, id, outcome, outcome)
		if e != nil || res.Status != 200 {
			t.Fatalf("%s: %+v %v", outcome, res, e)
		}
		var state string
		if e = pool.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1`, id).Scan(&state); e != nil {
			t.Fatal(e)
		}
		expected := "expired"
		if outcome == "failed" {
			expected = "payment_failed"
		}
		if state != expected {
			t.Fatalf("state %s", state)
		}
		q, e := (&quote.Service{Pool: pool, Clock: clk}).Calculate(ctx, product, "2026-11-04", "2026-11-05", 1)
		if e != nil || q.Available != 1 {
			t.Fatalf("stock not released: %+v %v", q, e)
		}
	}
	race := makeOrder("RNT-RACE", now.Add(time.Minute))
	var concurrent [2]Result
	var raceErr [2]error
	for i, choice := range []string{"succeeded", "failed"} {
		wg.Add(1)
		go func(i int, choice string) {
			defer wg.Done()
			concurrent[i], raceErr[i] = svc.Simulate(ctx, renter, race, "race-"+choice, choice)
		}(i, choice)
	}
	wg.Wait()
	if raceErr[0] != nil || raceErr[1] != nil || (concurrent[0].Status != 200 && concurrent[1].Status != 200) || (concurrent[0].Status != 409 && concurrent[1].Status != 409) {
		t.Fatalf("concurrent payments: %+v %v", concurrent, raceErr)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE order_id=$1`, race).Scan(&count); err != nil || count != 1 {
		t.Fatalf("concurrent payment count=%d %v", count, err)
	}
	late := makeOrder("RNT-LATE", now)
	res, e := svc.Simulate(ctx, renter, late, "late", "succeeded")
	if e != nil || res.Status != 409 || !strings.Contains(string(res.Body), `"hold_expired"`) {
		t.Fatalf("late: %+v %v", res, e)
	}
	var state string
	if err = pool.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1`, late).Scan(&state); err != nil || state != "expired" {
		t.Fatalf("expired state %s %v", state, err)
	}
}
