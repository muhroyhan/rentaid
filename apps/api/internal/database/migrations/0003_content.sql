CREATE TABLE media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text NOT NULL UNIQUE,
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    created_at timestamptz NOT NULL
);
CREATE TABLE content_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    page_key text NOT NULL UNIQUE CHECK (page_key IN ('home', 'faq', 'about', 'terms', 'privacy')),
    title text NOT NULL DEFAULT '',
    body text NOT NULL DEFAULT '',
    media_id uuid REFERENCES media(id),
    published_title text,
    published_body text,
    published_media_id uuid REFERENCES media(id),
    published_at timestamptz,
    updated_at timestamptz NOT NULL,
    CHECK ((published_at IS NULL AND published_title IS NULL AND published_body IS NULL)
        OR (published_at IS NOT NULL AND published_title IS NOT NULL AND published_body IS NOT NULL))
);
