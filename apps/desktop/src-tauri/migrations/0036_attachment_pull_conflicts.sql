-- Attachment metadata is immutable once archived. These conflicts originate
-- from the server-issued attachment flow, not a normal local outbox event.
CREATE TABLE local_attachment_pull_conflicts (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL REFERENCES local_attachments(id),
  server_version INTEGER NOT NULL CHECK (server_version >= 1),
  local_payload_json TEXT NOT NULL CHECK (json_valid(local_payload_json)),
  server_payload_json TEXT NOT NULL CHECK (json_valid(server_payload_json)),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution_reason TEXT,
  UNIQUE (attachment_id, server_version)
);

CREATE INDEX local_attachment_pull_conflicts_open_idx
  ON local_attachment_pull_conflicts (resolved_at, created_at, id);
