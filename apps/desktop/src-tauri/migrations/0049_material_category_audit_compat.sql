ALTER TABLE local_master_data_audit_entries RENAME TO local_master_data_audit_entries_previous;

CREATE TABLE local_master_data_audit_entries (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('country', 'project', 'site', 'unit', 'department', 'team', 'tax_template', 'exchange_rate', 'material_category')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'edit', 'enable', 'disable')),
  previous_json TEXT,
  next_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO local_master_data_audit_entries
  (id, actor_id, entity_type, entity_id, action, previous_json, next_json, created_at)
SELECT id, actor_id, entity_type, entity_id, action, previous_json, next_json, created_at
FROM local_master_data_audit_entries_previous;

DROP TABLE local_master_data_audit_entries_previous;

CREATE INDEX local_master_data_audit_entity_idx
  ON local_master_data_audit_entries (entity_type, entity_id, created_at);
