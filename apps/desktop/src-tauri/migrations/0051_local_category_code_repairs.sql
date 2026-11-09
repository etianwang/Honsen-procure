CREATE TABLE local_category_code_repairs (
  old_event_id TEXT PRIMARY KEY REFERENCES local_sync_outbox(event_id),
  new_event_id TEXT NOT NULL UNIQUE REFERENCES local_sync_outbox(event_id),
  actor_id TEXT NOT NULL REFERENCES local_accounts(id),
  old_business_code TEXT NOT NULL,
  new_business_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE local_category_code_repair_events (
  event_id TEXT PRIMARY KEY REFERENCES local_sync_outbox(event_id),
  repair_event_id TEXT NOT NULL REFERENCES local_category_code_repairs(old_event_id)
);
