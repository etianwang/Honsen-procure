ALTER TABLE local_sync_outbox ADD COLUMN owner_account_id TEXT REFERENCES local_accounts(id);
CREATE INDEX local_sync_outbox_owner_pending_idx
  ON local_sync_outbox (owner_account_id, acknowledged_at, superseded_at, created_at, event_id);
