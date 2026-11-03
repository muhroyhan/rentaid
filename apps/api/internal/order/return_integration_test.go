package order

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/checkout"
	"rentaid.local/api/internal/database"
	"rentaid.local/api/internal/product"
	"rentaid.local/api/internal/quote"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestReturnIntegration(t *testing.T) {
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
	name := "phase15_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(token[:12]))
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
	now := time.Date(2026, 11, 6, 1, 2, 3, 0, time.UTC)
	clk := &fixedClock{now: now}
	var owner, renter, other, store, category, productID string
	mkUser := func(email string) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,name,phone,created_at) VALUES($1,'x','user','User','0812',$2) RETURNING id::text`, email, now).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	owner = mkUser("owner@example.test")
	renter = mkUser("renter@example.test")
	other = mkUser("other@example.test")
	if err = pool.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,'Store','Address','0812','suspended',$2,$2) RETURNING id::text`, owner, now).Scan(&store); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES('Category',$1,$1) RETURNING id::text`, now).Scan(&category); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at) VALUES($1,$2,'Product','Description',10000,1,true,$3,$3) RETURNING id::text`, store, category, now).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	mkOrder := func(code, status, start, end string) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO orders(product_id,user_id,order_code,product_name,store_name,store_address,start_date,end_date,quantity,daily_price,total,status,hold_until,created_at) VALUES($1,$2,$3,'Snapshot','Store','Address',$4::date,$5::date,1,8000,16000,$6,$7,$8) RETURNING id::text`, productID, renter, code, start, end, status, now.Add(time.Hour), now).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	svc := Service{Pool: pool, Clock: clk}
	id := mkOrder("RNT-RETURN", "renting", "2026-11-06", "2026-11-07")
	for _, actor := range []string{renter, other} {
		if _, err = svc.Return(ctx, id, actor); !errors.Is(err, ErrNotFound) {
			t.Fatalf("unauthorized return: %v", err)
		}
	}
	for _, state := range []string{"pending_payment", "confirmed", "cancelled", "expired", "payment_failed", "completed"} {
		bad := mkOrder("RNT-BAD-"+state, state, "2026-10-01", "2026-10-02")
		var conflict *Conflict
		if _, err = svc.Return(ctx, bad, owner); !errors.As(err, &conflict) || conflict.Status != state {
			t.Fatalf("state %s: %v", state, err)
		}
	}
	var returned [2]time.Time
	var errs [2]error
	var wg sync.WaitGroup
	for i := range returned {
		wg.Add(1)
		go func(i int) { defer wg.Done(); returned[i], errs[i] = svc.Return(ctx, id, owner) }(i)
	}
	wg.Wait()
	if errs[0] != nil || errs[1] != nil || !returned[0].Equal(now) || !returned[1].Equal(now) {
		t.Fatalf("return retry: %v %v", returned, errs)
	}
	var history int
	var actor string
	if err = pool.QueryRow(ctx, `SELECT count(*),max(actor_id::text) FROM order_status_history WHERE order_id=$1 AND from_status='renting' AND to_status='completed'`, id).Scan(&history, &actor); err != nil || history != 1 || actor != owner {
		t.Fatalf("return history %d %s %v", history, actor, err)
	}
	snapshot, err := (&checkout.Service{Pool: pool, Clock: clk}).Get(ctx, renter, id)
	if err != nil || snapshot.Total != 16000 || snapshot.DailyPrice != 8000 || snapshot.ReturnedAt == nil || !snapshot.ReturnedAt.Equal(now) {
		t.Fatalf("snapshot: %+v %v", snapshot, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE stores SET status='approved' WHERE id=$1`, store); err != nil {
		t.Fatal(err)
	}
	quotes := quote.Service{Pool: pool, Clock: clk}
	for _, day := range []string{"2026-11-06", "2026-11-07"} {
		if _, err = quotes.Calculate(ctx, productID, day, day, 1); !errors.Is(err, quote.ErrUnavailable) {
			t.Fatalf("early return released %s: %v", day, err)
		}
	}
	result, err := (&checkout.Service{Pool: pool, Clock: clk}).Create(ctx, other, "stock-test", checkout.Input{ProductID: productID, StartDate: "2026-11-07", EndDate: "2026-11-07", Quantity: 1, ExpectedTotal: 10000, ExpectedAvailable: 1})
	if err != nil || result.Status != 409 {
		t.Fatalf("checkout stock: %+v %v", result, err)
	}
	var changed struct {
		Code  string      `json:"code"`
		Quote quote.Quote `json:"quote"`
	}
	if err = json.Unmarshal(result.Body, &changed); err != nil || changed.Code != "quote_changed" || changed.Quote.Available != 0 {
		t.Fatalf("checkout availability: %+v %v", changed, err)
	}
	vendor := product.Service{Pool: pool, Clock: clk}
	input := product.Input{CategoryID: category, Name: "Product", Description: "Description", DailyPrice: 10000, Stock: 0, PhotoIDs: []string{}}
	if _, err = vendor.Update(ctx, owner, productID, input); !errors.Is(err, product.ErrConflict) {
		t.Fatalf("stock reduction during rental: %v", err)
	}
	clk.now = time.Date(2026, 11, 8, 0, 0, 0, 0, time.UTC)
	q, err := quotes.Calculate(ctx, productID, "2026-11-08", "2026-11-08", 1)
	if err != nil || q.Available != 1 {
		t.Fatalf("after last day: %+v %v", q, err)
	}
	if _, err = vendor.Update(ctx, owner, productID, input); err != nil {
		t.Fatalf("stock reduction after rental: %v", err)
	}
	late := mkOrder("RNT-LATE", "renting", "2026-11-01", "2026-11-02")
	at, err := svc.Return(ctx, late, owner)
	if err != nil || !at.Equal(clk.now) {
		t.Fatalf("late return: %v %v", at, err)
	}
	lateOrder, err := (&checkout.Service{Pool: pool, Clock: clk}).Get(ctx, renter, late)
	if err != nil || lateOrder.Total != 16000 {
		t.Fatalf("late snapshot: %+v %v", lateOrder, err)
	}
}
