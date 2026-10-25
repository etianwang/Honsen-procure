CREATE TABLE local_attachment_transfers (
  id TEXT PRIMARY KEY REFERENCES local_order_attachments(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('purchase_order','receipt','procurement_expenditure')),
  owner_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  country_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  version_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  verified_payload_json TEXT CHECK (verified_payload_json IS NULL OR json_valid(verified_payload_json))
);
CREATE INDEX local_attachment_transfers_owner_idx ON local_attachment_transfers(owner_type,owner_id);
