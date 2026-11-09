CREATE TABLE local_procurement_expenditures (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  project_id TEXT NOT NULL REFERENCES local_projects(id),
  supplier_id TEXT REFERENCES local_suppliers(id),
  payee_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('XOF','XAF','CNY','USD','EUR','ETB')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  payment_date TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('advance','progress','final','other')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bank_transfer','mobile_payment','other')),
  payment_handler_id TEXT NOT NULL,
  voucher_reference TEXT,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('recorded','reversed')),
  corrects_expenditure_id TEXT UNIQUE REFERENCES local_procurement_expenditures(id),
  correction_reason TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX local_procurement_expenditures_order_idx ON local_procurement_expenditures(order_id, currency, created_at);
