ALTER TABLE local_purchase_order_items ADD COLUMN catalog_price_id TEXT REFERENCES local_material_prices(id);
