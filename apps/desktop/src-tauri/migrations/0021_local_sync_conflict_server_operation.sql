ALTER TABLE local_sync_conflicts
  ADD COLUMN server_operation TEXT NOT NULL DEFAULT 'upsert'
  CHECK (server_operation IN ('upsert', 'soft_delete'));
