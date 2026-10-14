CREATE TABLE attachment_uploads (
  id UUID PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type = 'procurement_expenditure'),
  owner_id UUID NOT NULL,
  order_id UUID NOT NULL,
  project_id UUID NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_length BIGINT NOT NULL CHECK (byte_length BETWEEN 1 AND 104857600),
  checksum_sha256 TEXT NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  object_key TEXT NOT NULL UNIQUE,
  uploader_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ
);

CREATE INDEX attachment_uploads_order_idx ON attachment_uploads (order_id, created_at);
