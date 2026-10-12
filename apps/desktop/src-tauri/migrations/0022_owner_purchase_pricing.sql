ALTER TABLE local_purchase_orders
  ADD COLUMN procurement_mode TEXT
  CHECK (procurement_mode IN ('owner_self_purchase', 'honsen_self_purchase'));

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_quote_source TEXT
  CHECK (owner_quote_source IN ('catalog_price', 'manual_reference'));

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_catalog_price_id TEXT REFERENCES local_material_prices(id);

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_manual_reference_reason TEXT;

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_manual_reference_actor_id TEXT;

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_manual_reference_at INTEGER;

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_source_unit_price_minor INTEGER CHECK (owner_source_unit_price_minor >= 0);

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_locked_exchange_rate_decimal TEXT;

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_converted_reference_unit_minor INTEGER CHECK (owner_converted_reference_unit_minor >= 0);

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_markup_json TEXT;

ALTER TABLE local_purchase_order_items
  ADD COLUMN owner_final_unit_price_minor INTEGER CHECK (owner_final_unit_price_minor >= 0);
