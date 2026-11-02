ALTER TABLE media ADD COLUMN owner_id uuid REFERENCES users(id);
CREATE INDEX media_owner_idx ON media(owner_id);
