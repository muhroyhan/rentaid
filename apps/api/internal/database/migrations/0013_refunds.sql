CREATE TABLE refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
    amount bigint NOT NULL CHECK (amount > 0),
    status text NOT NULL CHECK (status = 'succeeded'),
    created_at timestamptz NOT NULL
);
CREATE INDEX orders_expiring_holds_idx ON orders(hold_until, id) WHERE status = 'pending_payment';
