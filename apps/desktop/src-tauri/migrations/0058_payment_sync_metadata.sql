CREATE TABLE local_procurement_expenditure_sync_payloads (
  expenditure_id TEXT PRIMARY KEY REFERENCES local_procurement_expenditures(id),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE TRIGGER local_payment_sync_payload_no_update BEFORE UPDATE ON local_procurement_expenditure_sync_payloads
BEGIN SELECT RAISE(ABORT,'payment synchronization snapshots are immutable'); END;
CREATE TRIGGER local_payment_sync_payload_no_delete BEFORE DELETE ON local_procurement_expenditure_sync_payloads
BEGIN SELECT RAISE(ABORT,'payment synchronization snapshots are permanent'); END;
