CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 10000),
    daily_price bigint NOT NULL CHECK (daily_price > 0),
    stock integer NOT NULL CHECK (stock >= 0),
    published boolean NOT NULL DEFAULT false,
    archived boolean NOT NULL DEFAULT false,
    hidden boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX products_catalog_idx ON products(created_at DESC, id DESC);
CREATE INDEX products_store_idx ON products(store_id, created_at DESC, id DESC);
CREATE INDEX products_category_idx ON products(category_id);
CREATE TABLE product_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    media_id uuid NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    position integer NOT NULL CHECK (position >= 0),
    UNIQUE(product_id, media_id),
    UNIQUE(product_id, position)
);
CREATE TABLE product_moderation_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    hidden boolean NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) > 0),
    created_at timestamptz NOT NULL
);
CREATE INDEX product_moderation_history_idx ON product_moderation_history(product_id, created_at, id);
