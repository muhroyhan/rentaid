package content

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "golang.org/x/image/webp"
	"rentaid.local/api/internal/clock"
)

const MaxBytes = 5 << 20

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
type Service struct {
	Pool  *pgxpool.Pool
	Clock clock.Clock
	Dir   string
}

func ValidKey(key string) bool {
	switch key {
	case "home", "faq", "about", "terms", "privacy":
		return true
	}
	return false
}
func (s *Service) Draft(ctx context.Context, key string) (Page, error) {
	p := Page{Key: key}
	if !ValidKey(key) {
		return p, ErrInvalid
	}
	err := s.Pool.QueryRow(ctx, `SELECT title,body,media_id::text,published_at IS NOT NULL FROM content_pages WHERE page_key=$1`, key).
		Scan(&p.Title, &p.Body, &p.ImageID, &p.Published)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, nil
	}
	return p, err
}
func (s *Service) Public(ctx context.Context, key string) (Page, error) {
	p := Page{Key: key, Published: true}
	if !ValidKey(key) {
		return p, ErrInvalid
	}
	err := s.Pool.QueryRow(ctx, `SELECT published_title,published_body,published_media_id::text FROM content_pages WHERE page_key=$1 AND published_at IS NOT NULL`, key).
		Scan(&p.Title, &p.Body, &p.ImageID)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}
func (s *Service) Save(ctx context.Context, p Page) (Page, error) {
	if !ValidKey(p.Key) || len([]rune(p.Title)) > 200 || len([]rune(p.Body)) > 50000 {
		return Page{}, ErrInvalid
	}
	var exists bool
	if p.ImageID != nil {
		err := s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM media WHERE id::text=$1)", *p.ImageID).Scan(&exists)
		if err != nil {
			return Page{}, err
		}
		if !exists {
			return Page{}, ErrInvalid
		}
	}
	_, err := s.Pool.Exec(ctx, `INSERT INTO content_pages(page_key,title,body,media_id,updated_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(page_key) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,media_id=EXCLUDED.media_id,updated_at=EXCLUDED.updated_at`,
		p.Key, p.Title, p.Body, p.ImageID, s.Clock.Now().UTC())
	if err != nil {
		return Page{}, err
	}
	return s.Draft(ctx, p.Key)
}
func (s *Service) Publish(ctx context.Context, key string) (Page, error) {
	if !ValidKey(key) {
		return Page{}, ErrInvalid
	}
	result, err := s.Pool.Exec(ctx, `UPDATE content_pages SET published_title=title,published_body=body,
        published_media_id=media_id,published_at=$2,updated_at=$2
        WHERE page_key=$1 AND title ~ '[^[:space:]]' AND body ~ '[^[:space:]]'`, key, s.Clock.Now().UTC())
	if err != nil {
		return Page{}, err
	}
	if result.RowsAffected() == 0 {
		return Page{}, ErrInvalid
	}
	return s.Draft(ctx, key)
}
func (s *Service) Upload(ctx context.Context, r io.Reader) (Media, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxBytes+1))
	if err != nil {
		return Media{}, err
	}
	if len(data) > MaxBytes {
		return Media{}, ErrTooLarge
	}
	if len(data) == 0 {
		return Media{}, ErrInvalid
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 20000000 {
		return Media{}, ErrInvalid
	}
	kinds := map[string]string{"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
	mime, ok := kinds[format]
	if !ok {
		return Media{}, ErrInvalid
	}
	if _, decodedFormat, decodeErr := image.Decode(bytes.NewReader(data)); decodeErr != nil || decodedFormat != format {
		return Media{}, ErrInvalid
	}
	random := make([]byte, 16)
	if _, err = rand.Read(random); err != nil {
		return Media{}, err
	}
	filename := hex.EncodeToString(random)
	if err = os.MkdirAll(s.Dir, 0700); err != nil {
		return Media{}, err
	}
	path := filepath.Join(s.Dir, filename)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return Media{}, err
	}
	if _, err = file.Write(data); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return Media{}, err
	}
	if err = file.Close(); err != nil {
		_ = os.Remove(path)
		return Media{}, err
	}
	m := Media{ContentType: mime, Size: int64(len(data))}
	err = s.Pool.QueryRow(ctx, `INSERT INTO media(filename,content_type,size_bytes,created_at) VALUES($1,$2,$3,$4) RETURNING id::text`,
		filename, mime, m.Size, s.Clock.Now().UTC()).Scan(&m.ID)
	if err != nil {
		_ = os.Remove(path)
		return Media{}, err
	}
	return m, nil
}
func (s *Service) ReadMedia(ctx context.Context, id string, public bool) ([]byte, string, error) {
	var filename, mime string
	query := `SELECT filename,content_type FROM media WHERE id::text=$1`
	if public {
		query += ` AND EXISTS (SELECT 1 FROM content_pages WHERE published_at IS NOT NULL AND published_media_id=media.id)`
	}
	err := s.Pool.QueryRow(ctx, query, id).Scan(&filename, &mime)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", err
	}
	if len(filename) != 32 || strings.Trim(filename, "0123456789abcdef") != "" {
		return nil, "", fmt.Errorf("invalid stored filename")
	}
	data, err := os.ReadFile(filepath.Join(s.Dir, filename))
	if errors.Is(err, os.ErrNotExist) {
		return nil, "", ErrNotFound
	}
	return data, mime, err
}
