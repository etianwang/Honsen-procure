CREATE TABLE local_sync_projection_quarantine (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  dependency_id TEXT,
  reason TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
