-- Column additions for both historical payment schemas are applied transactionally by
-- apply_expenditure_branch_compat; original migration files/checksums remain unchanged.
CREATE TABLE IF NOT EXISTS local_procurement_expenditure_vouchers (
  expenditure_id TEXT NOT NULL REFERENCES local_procurement_expenditures(id),
  attachment_id TEXT NOT NULL REFERENCES local_order_attachments(id),
  PRIMARY KEY (expenditure_id, attachment_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS local_expenditure_one_reversal_idx
  ON local_procurement_expenditures(corrects_expenditure_id)
  WHERE corrects_expenditure_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS local_expenditures_no_update BEFORE UPDATE ON local_procurement_expenditures
BEGIN SELECT RAISE(ABORT, 'payments are append-only'); END;
CREATE TRIGGER IF NOT EXISTS local_expenditures_no_delete BEFORE DELETE ON local_procurement_expenditures
BEGIN SELECT RAISE(ABORT, 'payments are permanent'); END;
CREATE TRIGGER IF NOT EXISTS local_expenditures_validate_reversal BEFORE INSERT ON local_procurement_expenditures
WHEN (NEW.status = 'recorded' AND (NEW.corrects_expenditure_id IS NOT NULL OR NEW.correction_reason IS NOT NULL))
  OR (NEW.status = 'reversed' AND (
    NEW.correction_reason IS NULL OR length(trim(NEW.correction_reason)) NOT BETWEEN 1 AND 1000 OR
    NOT EXISTS (SELECT 1 FROM local_procurement_expenditures p WHERE p.id=NEW.corrects_expenditure_id
      AND p.id<>NEW.id AND p.status='recorded' AND p.order_id=NEW.order_id AND p.project_id=NEW.project_id
      AND p.currency=NEW.currency AND p.amount_minor=NEW.amount_minor AND p.payee_name=NEW.payee_name
      AND p.payment_date=NEW.payment_date AND p.payment_type=NEW.payment_type AND p.payment_method=NEW.payment_method)))
BEGIN SELECT RAISE(ABORT, 'invalid payment reversal'); END;
