CREATE TABLE local_master_data_audit_entries (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('country', 'project', 'site')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'edit', 'enable', 'disable')),
  previous_json TEXT,
  next_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX local_master_data_audit_entity_idx
  ON local_master_data_audit_entries (entity_type, entity_id, created_at);
