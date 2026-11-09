CREATE TABLE local_remote_category_repair_intents (
  request_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES local_accounts(id),
  category_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  new_business_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'conflict')),
  created_at INTEGER NOT NULL
);
