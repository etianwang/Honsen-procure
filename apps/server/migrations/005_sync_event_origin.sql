ALTER TABLE sync_events
  ADD COLUMN origin_account_id UUID REFERENCES users(id),
  ADD COLUMN origin_installation_id UUID,
  ADD COLUMN origin_status TEXT NOT NULL DEFAULT 'legacy_unverified'
    CHECK (origin_status IN ('attested', 'legacy_unverified')),
  ADD COLUMN origin_attested_at TIMESTAMPTZ;

ALTER TABLE sync_conflicts
  ADD COLUMN origin_account_id UUID REFERENCES users(id),
  ADD COLUMN origin_installation_id UUID,
  ADD COLUMN origin_status TEXT NOT NULL DEFAULT 'legacy_unverified'
    CHECK (origin_status IN ('attested', 'legacy_unverified'));

CREATE TABLE sync_origin_quarantine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL CHECK (source_table IN ('sync_events', 'sync_conflicts')),
  source_id UUID NOT NULL,
  reason TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id)
);

INSERT INTO sync_origin_quarantine (source_table, source_id, reason)
SELECT 'sync_events', event_id, 'legacy origin was not bound to an authenticated session installation'
FROM sync_events;

INSERT INTO sync_origin_quarantine (source_table, source_id, reason)
SELECT 'sync_conflicts', id, 'legacy conflict origin was not bound to an authenticated session installation'
FROM sync_conflicts;

CREATE INDEX sync_events_attested_origin_idx
  ON sync_events (origin_account_id, origin_installation_id)
  WHERE origin_status = 'attested';
CREATE INDEX sync_conflicts_attested_origin_idx
  ON sync_conflicts (origin_account_id, origin_installation_id)
  WHERE origin_status = 'attested';
