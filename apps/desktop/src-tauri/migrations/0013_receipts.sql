CREATE TABLE local_receipts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  received_at TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  over_receipt_reason TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE local_receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES local_receipts(id),
  order_item_id TEXT NOT NULL REFERENCES local_purchase_order_items(id),
  quantity_decimal TEXT NOT NULL,
  unit TEXT NOT NULL,
  UNIQUE (receipt_id, order_item_id)
);

CREATE INDEX local_receipts_order_idx ON local_receipts (order_id, received_at, created_at);
