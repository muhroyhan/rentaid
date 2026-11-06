//go:build integration

package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"rentaid.local/api/internal/auth"
	"rentaid.local/api/internal/database"
	"rentaid.local/api/internal/product"
	"strings"
	"sync"
	"testing"
	"time"
)

type fixedClock struct{ now time.Time }

func (c *fixedClock) Now() time.Time { return c.now }
func TestCheckoutIntegration(t *testing.T) {
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
	name := "phase11_" + strings.ToLower(strings.NewReplacer("-", "a", "_", "b").Replace(token[:12]))
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
	clk := &fixedClock{now}
	var owner, user1, user2, store, category, id string
	makeUser := func(email string) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO users(email,password_hash,role,name,phone,created_at) VALUES($1,'x','user','User','08123',$2) RETURNING id::text`, email, now).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	owner = makeUser("owner@example.test")
	user1 = makeUser("one@example.test")
	user2 = makeUser("two@example.test")
	if err = pool.QueryRow(ctx, `INSERT INTO stores(owner_id,name,address,phone,status,created_at,updated_at) VALUES($1,'Store','Address','0812','approved',$2,$2) RETURNING id::text`, owner, now).Scan(&store); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO categories(name,created_at,updated_at) VALUES('Category',$1,$1) RETURNING id::text`, now).Scan(&category); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO products(store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at) VALUES($1,$2,'Original','Description',10000,1,true,$3,$3) RETURNING id::text`, store, category, now).Scan(&id); err != nil {
		t.Fatal(err)
	}
	svc := Service{Pool: pool, Clock: clk}
	in := Input{ProductID: id, StartDate: "2026-11-04", EndDate: "2026-11-05", Quantity: 1, ExpectedTotal: 20000, ExpectedAvailable: 1}
	if result, e := svc.Create(ctx, owner, "owner", in); e != nil || result.Status != 403 {
		t.Fatalf("own product: %v", err)
	}
	var results [2]Result
	var errs [2]error
	users := []string{user1, user2}
	var wg sync.WaitGroup
	for i := range users {
		wg.Add(1)
		go func(i int) { defer wg.Done(); results[i], errs[i] = svc.Create(ctx, users[i], "same-key", in) }(i)
	}
	wg.Wait()
	winner := -1
	for i, r := range results {
		if errs[i] != nil {
			t.Fatal(errs[i])
		}
		if r.Status == 201 {
			if winner != -1 {
				t.Fatal("two winners")
			}
			winner = i
		} else if r.Status != 409 {
			t.Fatalf("unexpected status %d", r.Status)
		}
	}
	if winner < 0 {
		t.Fatal("no winner")
	}
	var order Order
	if err = json.Unmarshal(results[winner].Body, &order); err != nil {
		t.Fatal(err)
	}
	if !order.HoldUntil.Equal(now.Add(15 * time.Minute)) {
		t.Fatalf("hold: %v", order.HoldUntil)
	}
	replay, err := svc.Create(ctx, users[winner], "same-key", in)
	if err != nil || replay.Status != 201 {
		t.Fatalf("replay: %+v %v", replay, err)
	}
	var repeated Order
	if err = json.Unmarshal(replay.Body, &repeated); err != nil || repeated.ID != order.ID {
		t.Fatal("replay changed order")
	}
	changed := in
	changed.ExpectedTotal++
	if _, err = svc.Create(ctx, users[winner], "same-key", changed); !errors.Is(err, ErrKeyReuse) {
		t.Fatalf("key reuse: %v", err)
	}
	vendor := product.Service{Pool: pool, Clock: clk}
	input := product.Input{CategoryID: category, Name: "New name", Description: "Description", DailyPrice: 12000, Stock: 0, PhotoIDs: []string{}}
	if _, err = vendor.Update(ctx, owner, id, input); !errors.Is(err, product.ErrConflict) {
		t.Fatalf("stock reduction: %v", err)
	}
	input.Stock = 1
	if _, err = vendor.Update(ctx, owner, id, input); err != nil {
		t.Fatal(err)
	}
	snapshot, err := svc.Get(ctx, users[winner], order.ID)
	if err != nil || snapshot.ProductName != "Original" || snapshot.DailyPrice != 10000 || snapshot.Total != 20000 {
		t.Fatalf("snapshot: %+v %v", snapshot, err)
	}
	if _, err = svc.Get(ctx, users[1-winner], order.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other user: %v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE users SET phone='' WHERE id=$1`, users[1-winner]); err != nil {
		t.Fatal(err)
	}
	if result, e := svc.Create(ctx, users[1-winner], "no-phone", in); e != nil || result.Status != 400 {
		t.Fatalf("phone: %v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE users SET phone='081234' WHERE id=$1`, users[1-winner]); err != nil {
		t.Fatal(err)
	}
	if replay, e := svc.Create(ctx, users[1-winner], "no-phone", in); e != nil || replay.Status != 400 {
		t.Fatalf("failure was not replayed: %+v %v", replay, e)
	}
	var count int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM orders`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("order count=%d %v", count, err)
	}
	clk.now = now.Add(15 * time.Minute)
	input.Stock = 0
	if _, err = vendor.Update(ctx, owner, id, input); err != nil {
		t.Fatalf("expired hold prevents stock change: %v", err)
	}
	input.Stock = 1
	if _, err = vendor.Update(ctx, owner, id, input); err != nil {
		t.Fatal(err)
	}
	newInput := in
	newInput.ExpectedTotal = 24000
	stale := newInput
	stale.ExpectedAvailable = 2
	if result, e := svc.Create(ctx, users[1-winner], "availability-changed", stale); e != nil || result.Status != 409 {
		t.Fatalf("changed availability: %+v %v", result, e)
	}
	var same [2]Result
	var sameErr [2]error
	for i := range same {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			same[i], sameErr[i] = svc.Create(ctx, users[1-winner], "parallel-key", newInput)
		}(i)
	}
	wg.Wait()
	var first, second Order
	if sameErr[0] != nil || sameErr[1] != nil || same[0].Status != 201 || same[1].Status != 201 {
		t.Fatalf("parallel retry: %+v %+v %v", same, sameErr, err)
	}
	if json.Unmarshal(same[0].Body, &first) != nil || json.Unmarshal(same[1].Body, &second) != nil || first.ID != second.ID {
		t.Fatal("parallel retry created multiple orders")
	}
	if _, err = vendor.ChangeState(ctx, owner, id, "archive", true); err != nil {
		t.Fatalf("archive ordered product: %v", err)
	}
	if saved, err := svc.Get(ctx, users[1-winner], first.ID); err != nil || saved.ProductName != "New name" || saved.Total != 24000 {
		t.Fatalf("archived snapshot: %+v %v", saved, err)
	}
}
