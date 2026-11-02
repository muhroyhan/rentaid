CREATE TABLE demo_product_seeds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seed_key text NOT NULL UNIQUE,
    product_id uuid NOT NULL UNIQUE REFERENCES products(id) ON DELETE RESTRICT
);
