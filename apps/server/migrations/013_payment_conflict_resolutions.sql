CREATE TABLE payment_conflict_resolutions (
  id UUID PRIMARY KEY,
  conflict_id UUID NOT NULL UNIQUE REFERENCES sync_conflicts(id),
  event_id UUID NOT NULL UNIQUE REFERENCES sync_events(event_id),
  rejected_event_id UUID NOT NULL REFERENCES sync_events(event_id),
  actor_id UUID NOT NULL REFERENCES users(id),
  installation_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  payload_json JSONB NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER payment_conflict_resolutions_immutable
BEFORE UPDATE OR DELETE ON payment_conflict_resolutions
FOR EACH ROW EXECUTE FUNCTION preserve_procurement_expenditure();
