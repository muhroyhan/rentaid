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
	err := selectDraft(ctx, s.Pool, key, &p)
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
	err := selectPublicPage(ctx, s.Pool, key, &p)
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
		err := hasMedia(ctx, s.Pool, *p.ImageID, &exists)
		if err != nil {
			return Page{}, err
		}
		if !exists {
			return Page{}, ErrInvalid
		}
	}
	_, err := saveDraft(ctx, s.Pool, p.Key, p.Title, p.Body, p.ImageID, s.Clock.Now().UTC())
	if err != nil {
		return Page{}, err
	}
	return s.Draft(ctx, p.Key)
}
func (s *Service) Publish(ctx context.Context, key string) (Page, error) {
	if !ValidKey(key) {
		return Page{}, ErrInvalid
	}
	result, err := publishDraft(ctx, s.Pool, key, s.Clock.Now().UTC())
	if err != nil {
		return Page{}, err
	}
	if result.RowsAffected() == 0 {
		return Page{}, ErrInvalid
	}
	return s.Draft(ctx, key)
}
func (s *Service) Upload(ctx context.Context, r io.Reader) (Media, error) {
	return s.UploadOwned(ctx, r, nil)
}

// UploadOwned stores vendor media with ownership, while CMS uploads remain unowned.
func (s *Service) UploadOwned(ctx context.Context, r io.Reader, owner *string) (Media, error) {
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
	err = insertMedia(ctx, s.Pool, filename, mime, m.Size, s.Clock.Now().UTC(), owner, &m.ID)
	if err != nil {
		_ = os.Remove(path)
		return Media{}, err
	}
	return m, nil
}
func (s *Service) ReadMedia(ctx context.Context, id string, public bool) ([]byte, string, error) {
	return s.readMedia(ctx, id, public, nil)
}

func (s *Service) ReadOwnedMedia(ctx context.Context, id, owner string) ([]byte, string, error) {
	return s.readMedia(ctx, id, false, &owner)
}

func (s *Service) readMedia(ctx context.Context, id string, public bool, owner *string) ([]byte, string, error) {
	var filename, mime string
	err := selectMedia(ctx, s.Pool, id, public, owner, &filename, &mime)
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
