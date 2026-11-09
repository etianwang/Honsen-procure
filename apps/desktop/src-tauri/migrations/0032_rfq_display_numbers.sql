CREATE TABLE local_rfqs__display_numbers (
  id TEXT PRIMARY KEY,
  source_order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  supplier_snapshot_json TEXT NOT NULL,
  display_no TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'closed')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO local_rfqs__display_numbers
SELECT * FROM local_rfqs;

DROP TABLE local_rfqs;
ALTER TABLE local_rfqs__display_numbers RENAME TO local_rfqs;
