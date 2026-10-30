package auth

import (
	"sync"
	"time"

	"rentaid.local/api/internal/clock"
)

type attempt struct {
	count   int
	expires time.Time
}
type Limiter struct {
	mu      sync.Mutex
	entries map[string]attempt
	Clock   clock.Clock
	Max     int
	Window  time.Duration
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.entries == nil {
		l.entries = make(map[string]attempt)
	}
	now := l.Clock.Now()
	for k, v := range l.entries {
		if !now.Before(v.expires) {
			delete(l.entries, k)
		}
	}
	item := l.entries[key]
	if item.count >= l.Max {
		return false
	}
	if item.count == 0 {
		item.expires = now.Add(l.Window)
	}
	item.count++
	l.entries[key] = item
	return true
}

func (l *Limiter) Reset(key string) { l.mu.Lock(); defer l.mu.Unlock(); delete(l.entries, key) }
