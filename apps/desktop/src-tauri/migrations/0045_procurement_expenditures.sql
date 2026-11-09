CREATE TABLE local_procurement_expenditures (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  project_id TEXT NOT NULL REFERENCES local_projects(id),
  receipt_id TEXT REFERENCES local_receipts(id),
  counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('registered_supplier', 'market_casual')),
  supplier_id TEXT REFERENCES local_suppliers(id),
  payee_name TEXT NOT NULL,
  counterparty_snapshot_json TEXT NOT NULL CHECK (json_valid(counterparty_snapshot_json)),
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_payment', 'other')),
  payment_handler_id TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('recorded', 'reversed')),
  corrects_expenditure_id TEXT REFERENCES local_procurement_expenditures(id),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX local_procurement_expenditures_order_idx ON local_procurement_expenditures (order_id, payment_date, created_at);

CREATE TABLE local_procurement_expenditure_vouchers (
  expenditure_id TEXT NOT NULL REFERENCES local_procurement_expenditures(id),
  attachment_id TEXT NOT NULL REFERENCES local_order_attachments(id),
  PRIMARY KEY (expenditure_id, attachment_id)
);
