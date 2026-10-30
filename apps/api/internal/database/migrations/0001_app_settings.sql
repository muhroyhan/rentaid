CREATE TABLE app_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    value text NOT NULL,
    updated_at timestamptz NOT NULL
);
