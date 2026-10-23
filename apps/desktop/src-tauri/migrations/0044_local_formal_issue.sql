ALTER TABLE local_sync_state
  ADD COLUMN installation_short_code TEXT NOT NULL DEFAULT '';

ALTER TABLE local_sync_state
  ADD COLUMN next_formal_sequence INTEGER NOT NULL DEFAULT 1
  CHECK (next_formal_sequence > 0);

ALTER TABLE local_purchase_orders
  ADD COLUMN document_type TEXT
  CHECK (document_type IN ('OPA', 'HPA', 'SPO'));

ALTER TABLE local_purchase_orders
  ADD COLUMN formal_document_no TEXT;

ALTER TABLE local_purchase_orders
  ADD COLUMN formal_installation_id TEXT;

ALTER TABLE local_purchase_orders
  ADD COLUMN formal_sequence INTEGER
  CHECK (formal_sequence > 0);

ALTER TABLE local_purchase_orders
  ADD COLUMN formally_issued_at INTEGER;

ALTER TABLE local_purchase_orders
  ADD COLUMN formal_snapshot_json TEXT CHECK (formal_snapshot_json IS NULL OR json_valid(formal_snapshot_json));

CREATE UNIQUE INDEX local_purchase_orders_formal_number_idx
  ON local_purchase_orders (formal_document_no)
  WHERE formal_document_no IS NOT NULL;

CREATE UNIQUE INDEX local_purchase_orders_formal_installation_sequence_idx
  ON local_purchase_orders (formal_installation_id, formal_sequence)
  WHERE formal_installation_id IS NOT NULL;

CREATE TRIGGER local_formal_order_header_immutable
BEFORE UPDATE OF document_type, formal_document_no, formal_installation_id, formal_sequence, formally_issued_at, formal_snapshot_json
ON local_purchase_orders
WHEN OLD.formally_issued_at IS NOT NULL AND (
  NEW.document_type IS NOT OLD.document_type OR
  NEW.formal_document_no IS NOT OLD.formal_document_no OR
  NEW.formal_installation_id IS NOT OLD.formal_installation_id OR
  NEW.formal_sequence IS NOT OLD.formal_sequence OR
  NEW.formally_issued_at IS NOT OLD.formally_issued_at OR
  NEW.formal_snapshot_json IS NOT OLD.formal_snapshot_json
)
BEGIN
  SELECT RAISE(ABORT, 'issued formal order is immutable');
END;

CREATE TRIGGER local_formal_order_line_snapshot_immutable
BEFORE UPDATE OF supplier_snapshot_json, owner_quote_source, owner_catalog_price_id,
  owner_manual_reference_reason, owner_manual_reference_actor_id, owner_manual_reference_at,
  owner_source_unit_price_minor, owner_locked_exchange_rate_decimal,
  owner_converted_reference_unit_minor, owner_markup_json, owner_final_unit_price_minor
ON local_purchase_order_items
WHEN EXISTS (
  SELECT 1 FROM local_purchase_orders
  WHERE id = OLD.order_id AND formally_issued_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'issued formal order snapshot is immutable');
END;
