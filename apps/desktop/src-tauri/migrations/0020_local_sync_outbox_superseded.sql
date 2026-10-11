ALTER TABLE local_sync_outbox ADD COLUMN superseded_at INTEGER;

CREATE INDEX local_sync_outbox_actionable_idx
  ON local_sync_outbox (acknowledged_at, superseded_at, created_at, event_id);
