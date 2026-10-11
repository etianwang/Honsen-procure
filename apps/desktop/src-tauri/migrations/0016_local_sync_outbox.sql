CREATE TABLE local_sync_entity_versions (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  server_version INTEGER NOT NULL DEFAULT 0 CHECK (server_version >= 0),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE local_sync_outbox (
  event_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'soft_delete')),
  base_version INTEGER NOT NULL CHECK (base_version >= 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error TEXT,
  acknowledged_at INTEGER
);
CREATE INDEX local_sync_outbox_pending_idx
  ON local_sync_outbox (acknowledged_at, created_at, event_id);

CREATE TABLE local_sync_conflicts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES local_sync_outbox(event_id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  local_payload_json TEXT NOT NULL CHECK (json_valid(local_payload_json)),
  server_payload_json TEXT NOT NULL CHECK (json_valid(server_payload_json)),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution_reason TEXT
);
