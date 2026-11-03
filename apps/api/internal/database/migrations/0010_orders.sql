CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    start_date date NOT NULL,
    end_date date NOT NULL CHECK (end_date >= start_date),
    quantity integer NOT NULL CHECK (quantity > 0),
    status text NOT NULL CHECK (status IN ('pending_payment', 'confirmed', 'renting', 'completed', 'cancelled', 'expired', 'payment_failed')),
    hold_until timestamptz,
    created_at timestamptz NOT NULL,
    CHECK (status <> 'pending_payment' OR hold_until IS NOT NULL)
);
CREATE INDEX orders_product_dates_idx ON orders(product_id, start_date, end_date);
