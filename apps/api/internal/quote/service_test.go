package quote

import (
	"testing"
	"time"
)

func TestDates(t *testing.T) {
	now := time.Date(2024, 2, 27, 18, 0, 0, 0, time.UTC) // 28 February in Jakarta.
	for _, tc := range []struct {
		start, end string
		days       int
		valid      bool
	}{
		{"2024-02-28", "2024-02-28", 1, true}, {"2024-02-28", "2024-03-01", 3, true},
		{"2024-11-04", "2024-11-05", 2, true}, {"2024-12-31", "2025-01-01", 2, true},
		{"2024-02-27", "2024-02-28", 0, false}, {"2024-03-02", "2024-03-01", 0, false},
		{"2024-03-01", "2024-03-31", 0, false}, {"2024-02-30", "2024-03-01", 0, false},
	} {
		t.Run(tc.start+"/"+tc.end, func(t *testing.T) {
			_, _, days, err := Dates(tc.start, tc.end, now)
			if (err == nil) != tc.valid || (tc.valid && days != tc.days) {
				t.Fatalf("days=%d err=%v", days, err)
			}
		})
	}
}
