CREATE TABLE local_attachments (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('procurement_expenditure')),
  owner_id TEXT NOT NULL REFERENCES local_procurement_expenditures(id),
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  project_id TEXT NOT NULL REFERENCES local_projects(id),
  original_name TEXT NOT NULL CHECK (length(trim(original_name)) BETWEEN 1 AND 255),
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 104857600),
  local_path TEXT NOT NULL,
  upload_state TEXT NOT NULL DEFAULT 'pending_upload' CHECK (upload_state IN ('pending_upload', 'pending_download', 'uploaded')),
  object_key TEXT,
  checksum TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX local_attachments_owner_idx ON local_attachments (owner_type, owner_id, created_at);
CREATE INDEX local_attachments_pending_idx ON local_attachments (upload_state, created_at);
