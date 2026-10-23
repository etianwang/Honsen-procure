CREATE TABLE local_sync_catalog_quarantine (
  account_id TEXT NOT NULL REFERENCES local_accounts(id),
  cursor TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  original_payload_json TEXT NOT NULL CHECK (json_valid(original_payload_json)),
  reason TEXT NOT NULL,
  recovered_version INTEGER,
  PRIMARY KEY (account_id, cursor, entity_type, entity_id, server_version)
);

ALTER TABLE local_sync_remote_entities ADD COLUMN source_cursor TEXT NOT NULL DEFAULT '0';

CREATE INDEX local_sync_price_source_order_idx ON local_sync_remote_entities (
  json_extract(payload_json, '$.materialId'),
  json_extract(payload_json, '$.supplierId'),
  json_extract(payload_json, '$.currency'),
  CAST(source_cursor AS INTEGER)
) WHERE entity_type = 'material_price';
