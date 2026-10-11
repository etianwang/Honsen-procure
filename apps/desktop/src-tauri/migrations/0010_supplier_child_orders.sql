ALTER TABLE local_purchase_orders
  ADD COLUMN supplier_snapshot_json TEXT;

ALTER TABLE local_purchase_orders
  ADD COLUMN locked_exchange_rate_decimal TEXT;

CREATE TABLE local_supplier_order_allocations (
  id TEXT PRIMARY KEY,
  parent_order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  child_order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  parent_item_id TEXT NOT NULL REFERENCES local_purchase_order_items(id),
  child_item_id TEXT NOT NULL REFERENCES local_purchase_order_items(id),
  created_at INTEGER NOT NULL,
  UNIQUE (parent_item_id),
  UNIQUE (child_item_id)
);

CREATE INDEX local_supplier_order_allocations_parent_idx
  ON local_supplier_order_allocations (parent_order_id, child_order_id);
