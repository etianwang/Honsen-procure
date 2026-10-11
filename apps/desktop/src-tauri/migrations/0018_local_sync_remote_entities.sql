CREATE TABLE local_sync_remote_entities (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'soft_delete')),
  server_version INTEGER NOT NULL CHECK (server_version > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  changed_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
