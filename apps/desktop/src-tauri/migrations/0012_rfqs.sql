CREATE TABLE local_rfqs (
  id TEXT PRIMARY KEY,
  source_order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  supplier_snapshot_json TEXT NOT NULL,
  display_no TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL CHECK (currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'closed')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE local_rfq_items (
  id TEXT PRIMARY KEY,
  rfq_id TEXT NOT NULL REFERENCES local_rfqs(id),
  source_item_id TEXT NOT NULL REFERENCES local_purchase_order_items(id),
  material_snapshot_json TEXT NOT NULL,
  quantity_decimal TEXT NOT NULL,
  unit TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  UNIQUE (rfq_id, source_item_id),
  UNIQUE (rfq_id, sort_order)
);
