package product

import (
	"errors"
	"time"
)

var ErrInvalid = errors.New("invalid product")

var ErrNotFound = errors.New("product not found")

var ErrForbidden = errors.New("store not approved")

var ErrConflict = errors.New("product conflict")

type Product struct {
	ID           string    `json:"id"`
	StoreID      string    `json:"storeId"`
	StoreName    string    `json:"storeName"`
	StoreAddress string    `json:"storeAddress"`
	CategoryID   string    `json:"categoryId"`
	CategoryName string    `json:"categoryName"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DailyPrice   int64     `json:"dailyPrice"`
	Stock        int32     `json:"stock"`
	Published    bool      `json:"published"`
	Archived     bool      `json:"archived"`
	Hidden       bool      `json:"hidden"`
	PhotoIDs     []string  `json:"photoIds"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Input struct {
	CategoryID  string   `json:"categoryId"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	DailyPrice  int64    `json:"dailyPrice"`
	Stock       int32    `json:"stock"`
	PhotoIDs    []string `json:"photoIds"`
}

type Decision struct {
	ActorID   string    `json:"actorId"`
	Hidden    bool      `json:"hidden"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"createdAt"`
}

type Detail struct {
	Product Product    `json:"product"`
	History []Decision `json:"history"`
}
