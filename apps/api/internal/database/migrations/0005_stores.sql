CREATE TABLE stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL UNIQUE REFERENCES users(id),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    address text NOT NULL CHECK (length(btrim(address)) > 0),
    phone text NOT NULL CHECK (length(btrim(phone)) > 0),
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE TABLE store_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES stores(id),
    actor_id uuid NOT NULL REFERENCES users(id),
    from_status text CHECK (from_status IN ('pending', 'approved', 'rejected', 'suspended')),
    to_status text NOT NULL CHECK (to_status IN ('pending', 'approved', 'rejected', 'suspended')),
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL
);
CREATE INDEX stores_queue_idx ON stores(created_at DESC, id DESC);
CREATE INDEX store_status_history_store_idx ON store_status_history(store_id, created_at, id);
