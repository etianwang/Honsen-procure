CREATE TABLE local_procurement_expenditures (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  project_id TEXT NOT NULL REFERENCES local_projects(id),
  receipt_id TEXT REFERENCES local_receipts(id),
  counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('registered_supplier', 'market_casual')),
  supplier_id TEXT REFERENCES local_suppliers(id),
  payee_name TEXT NOT NULL CHECK (length(trim(payee_name)) > 0),
  counterparty_snapshot_json TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('XOF', 'XAF', 'CNY', 'USD', 'EUR', 'ETB')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_payment', 'other')),
  payment_handler_id TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('recorded', 'reversed')),
  corrects_expenditure_id TEXT REFERENCES local_procurement_expenditures(id),
  correction_reason TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK ((counterparty_type = 'registered_supplier' AND supplier_id IS NOT NULL) OR (counterparty_type = 'market_casual' AND supplier_id IS NULL)),
  CHECK (counterparty_snapshot_json IS NULL OR json_valid(counterparty_snapshot_json)),
  CHECK ((corrects_expenditure_id IS NULL AND correction_reason IS NULL AND status = 'recorded') OR (corrects_expenditure_id IS NOT NULL AND correction_reason IS NOT NULL AND length(trim(correction_reason)) > 0))
);

CREATE INDEX local_procurement_expenditures_order_idx
  ON local_procurement_expenditures (order_id, created_at, id);

CREATE UNIQUE INDEX local_procurement_expenditure_one_reversal_idx
  ON local_procurement_expenditures (corrects_expenditure_id)
  WHERE status = 'reversed';

CREATE UNIQUE INDEX local_procurement_expenditure_one_replacement_idx
  ON local_procurement_expenditures (corrects_expenditure_id)
  WHERE status = 'recorded' AND corrects_expenditure_id IS NOT NULL;
