ALTER TABLE local_purchase_order_items
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'XOF'
  CHECK (currency IN ('XOF', 'CNY', 'USD', 'EUR'));

UPDATE local_purchase_order_items
SET currency = (
  SELECT currency
  FROM local_purchase_orders
  WHERE local_purchase_orders.id = local_purchase_order_items.order_id
);
