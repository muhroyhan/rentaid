CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
 amount bigint NOT NULL CHECK (amount > 0),
 status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'expired')),
 created_at timestamptz NOT NULL
);
CREATE INDEX payments_created_idx ON payments(created_at DESC, id DESC);
