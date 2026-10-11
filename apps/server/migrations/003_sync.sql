CREATE TABLE sync_entities (
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  version BIGINT NOT NULL CHECK (version > 0),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  payload_json JSONB NOT NULL,
  updated_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE sync_events (
  event_id UUID PRIMARY KEY,
  installation_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'soft_delete')),
  base_version BIGINT NOT NULL CHECK (base_version >= 0),
  result_status TEXT NOT NULL CHECK (result_status IN ('accepted', 'conflict', 'validation_error')),
  server_version BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE server_change_log (
  sequence BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'soft_delete')),
  version BIGINT NOT NULL CHECK (version > 0),
  payload_json JSONB NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX server_change_log_sequence_idx ON server_change_log (sequence);

CREATE TABLE sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES sync_events(event_id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  base_version BIGINT NOT NULL,
  server_version BIGINT NOT NULL,
  local_payload_json JSONB NOT NULL,
  server_payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sync_conflicts_event_idx ON sync_conflicts (event_id);
