CREATE TABLE local_master_data_seed_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES local_accounts(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  business_key TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at INTEGER NOT NULL
);
