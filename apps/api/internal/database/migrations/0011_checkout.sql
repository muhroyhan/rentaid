ALTER TABLE orders ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN order_code text UNIQUE;
ALTER TABLE orders ADD COLUMN product_name text;
ALTER TABLE orders ADD COLUMN store_name text;
ALTER TABLE orders ADD COLUMN store_address text;
ALTER TABLE orders ADD COLUMN daily_price bigint;
ALTER TABLE orders ADD COLUMN total bigint;
CREATE TABLE idempotency_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    endpoint text NOT NULL,
    key text NOT NULL,
    request_hash bytea NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    UNIQUE(user_id, endpoint, key)
);
CREATE TABLE order_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    from_status text,
    to_status text NOT NULL,
    actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL
);
