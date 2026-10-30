package clock

import (
	"time"
	_ "time/tzdata"
)

// Clock supplies the current time to business logic.
type Clock interface{ Now() time.Time }

type System struct{}

func (System) Now() time.Time { return time.Now() }

func Jakarta() (*time.Location, error) { return time.LoadLocation("Asia/Jakarta") }
