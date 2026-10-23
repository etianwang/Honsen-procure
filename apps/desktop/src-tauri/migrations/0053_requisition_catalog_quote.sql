ALTER TABLE local_purchase_order_items ADD COLUMN catalog_price_id TEXT REFERENCES local_material_prices(id);
ALTER TABLE local_sync_outbox ADD COLUMN rejected_at INTEGER;
ALTER TABLE local_sync_outbox ADD COLUMN quote_recovery_event_id TEXT;
