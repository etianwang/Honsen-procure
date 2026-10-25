CREATE TABLE local_payment_conflict_discovery (
  account_id TEXT NOT NULL REFERENCES local_accounts(id),
  conflict_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  PRIMARY KEY(account_id, conflict_id)
);
CREATE TABLE local_payment_conflict_decisions (
  id TEXT PRIMARY KEY,
  conflict_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE INDEX local_payment_conflict_canonical_idx ON local_payment_conflict_decisions(canonical_entity_id);
CREATE TRIGGER local_payment_decisions_no_update BEFORE UPDATE ON local_payment_conflict_decisions
BEGIN SELECT RAISE(ABORT,'payment decisions are immutable'); END;
CREATE TRIGGER local_payment_decisions_no_delete BEFORE DELETE ON local_payment_conflict_decisions
BEGIN SELECT RAISE(ABORT,'payment decisions are permanent'); END;

CREATE TABLE local_payment_conflict_recovery (
  event_id TEXT PRIMARY KEY REFERENCES local_sync_outbox(event_id),
  owner_account_id TEXT NOT NULL,
  original_payload_json TEXT NOT NULL CHECK(json_valid(original_payload_json)),
  recovered_at INTEGER NOT NULL
);
CREATE TRIGGER local_payment_recovery_no_update BEFORE UPDATE ON local_payment_conflict_recovery
BEGIN SELECT RAISE(ABORT,'payment recovery evidence is immutable'); END;
CREATE TRIGGER local_payment_recovery_no_delete BEFORE DELETE ON local_payment_conflict_recovery
BEGIN SELECT RAISE(ABORT,'payment recovery evidence is permanent'); END;

-- Reconciliation changes effective reads, never the original payment row.
-- The existing append-only trigger validates new reversals against that same effective original.
DROP TRIGGER local_expenditures_validate_reversal;
CREATE TRIGGER local_expenditures_validate_reversal BEFORE INSERT ON local_procurement_expenditures
WHEN (NEW.status='recorded' AND (NEW.corrects_expenditure_id IS NOT NULL OR NEW.correction_reason IS NOT NULL))
 OR (NEW.status='reversed' AND (
 NEW.correction_reason IS NULL OR length(trim(NEW.correction_reason)) NOT BETWEEN 1 AND 1000 OR
 NOT EXISTS(SELECT 1 FROM local_procurement_expenditures p
 LEFT JOIN local_payment_conflict_decisions d ON d.canonical_entity_id=p.id
 WHERE p.id=NEW.corrects_expenditure_id AND p.id<>NEW.id AND p.status='recorded'
 AND p.order_id=NEW.order_id AND p.project_id=NEW.project_id
 AND COALESCE(json_extract(d.payload_json,'$.canonicalPayload.currency'),p.currency)=NEW.currency
 AND COALESCE(CAST(json_extract(d.payload_json,'$.canonicalPayload.amountMinor') AS INTEGER),p.amount_minor)=NEW.amount_minor
 AND COALESCE(json_extract(d.payload_json,'$.canonicalPayload.payeeName'),p.payee_name)=NEW.payee_name
 AND COALESCE(json_extract(d.payload_json,'$.canonicalPayload.paymentDate'),p.payment_date)=NEW.payment_date
 AND COALESCE(json_extract(d.payload_json,'$.canonicalPayload.paymentType'),p.payment_type)=NEW.payment_type
 AND COALESCE(json_extract(d.payload_json,'$.canonicalPayload.paymentMethod'),p.payment_method)=NEW.payment_method)))
BEGIN SELECT RAISE(ABORT,'invalid payment reversal'); END;
