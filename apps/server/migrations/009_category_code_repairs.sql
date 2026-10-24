-- T04: retain an immutable record of explicit administrator repairs.
-- Safety: creates a new table only; migration runner applies it transactionally.
-- Rollback: retain this table while repair records are needed for replay and audit.
CREATE TABLE category_code_repairs (
  request_id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id),
  installation_id UUID NOT NULL,
  category_id UUID NOT NULL,
  expected_version BIGINT NOT NULL,
  result_version BIGINT NOT NULL,
  old_business_code TEXT NOT NULL,
  new_business_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
