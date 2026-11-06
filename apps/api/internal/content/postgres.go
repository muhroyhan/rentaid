package content

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"rentaid.local/api/internal/database"
)

func selectDraft(ctx context.Context, db database.Executor, key string, outPage *Page) error {
	return db.QueryRow(ctx, `SELECT title,body,media_id::text,published_at IS NOT NULL FROM content_pages WHERE page_key=$1`, key).Scan(&outPage.Title, &outPage.Body, &outPage.ImageID, &outPage.Published)
}

func selectPublicPage(ctx context.Context, db database.Executor, key string, outPage *Page) error {
	return db.QueryRow(ctx, `SELECT published_title,published_body,published_media_id::text FROM content_pages WHERE page_key=$1 AND published_at IS NOT NULL`, key).Scan(&outPage.Title, &outPage.Body, &outPage.ImageID)
}

func hasMedia(ctx context.Context, db database.Executor, id string, outExists *bool) error {
	return db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM media WHERE id::text=$1)", id).Scan(outExists)
}

func saveDraft(ctx context.Context, db database.Executor, key string, title string, body string, imageID *string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `INSERT INTO content_pages(page_key,title,body,media_id,updated_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(page_key) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,media_id=EXCLUDED.media_id,updated_at=EXCLUDED.updated_at`, key, title, body, imageID, now)
}

func publishDraft(ctx context.Context, db database.Executor, key string, now time.Time) (pgconn.CommandTag, error) {
	return db.Exec(ctx, `UPDATE content_pages SET published_title=title,published_body=body,
        published_media_id=media_id,published_at=$2,updated_at=$2
        WHERE page_key=$1 AND title ~ '[^[:space:]]' AND body ~ '[^[:space:]]'`, key, now)
}

func insertMedia(ctx context.Context, db database.Executor, filename string, mime string, size int64, now time.Time, owner *string, outID *string) error {
	return db.QueryRow(ctx, `INSERT INTO media(filename,content_type,size_bytes,created_at,owner_id) VALUES($1,$2,$3,$4,$5) RETURNING id::text`, filename, mime, size, now, owner).Scan(outID)
}

func selectMedia(ctx context.Context, db database.Executor, id string, public bool, owner *string, filename, mime *string) error {
	query := `SELECT filename,content_type FROM media WHERE id::text=$1`
	if public {
		query += ` AND (EXISTS (SELECT 1 FROM content_pages WHERE published_at IS NOT NULL AND published_media_id=media.id) OR EXISTS (SELECT 1 FROM product_photos pp JOIN products p ON p.id=pp.product_id JOIN stores s ON s.id=p.store_id WHERE pp.media_id=media.id AND p.published AND NOT p.archived AND NOT p.hidden AND s.status='approved'))`
	}
	args := []any{id}
	if owner != nil {
		query += ` AND owner_id::text=$2`
		args = append(args, *owner)
	}
	err := db.QueryRow(ctx, query, args...).Scan(filename, mime)
	return err
}
