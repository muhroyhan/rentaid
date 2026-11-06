package content

import (
	"errors"
)

var ErrNotFound = errors.New("not found")

var ErrInvalid = errors.New("invalid content")

var ErrTooLarge = errors.New("file too large")

type Page struct {
	Key       string  `json:"key"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	ImageID   *string `json:"imageId"`
	Published bool    `json:"published"`
}

type Media struct {
	ID          string `json:"id"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
}
