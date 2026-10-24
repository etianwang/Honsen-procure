CREATE TABLE procurement_expenditures (
  id UUID PRIMARY KEY,
  order_entity_type TEXT NOT NULL DEFAULT 'purchase_order' CHECK (order_entity_type = 'purchase_order'),
  order_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  country_id UUID NOT NULL REFERENCES countries(id),
  parent_order_id UUID,
  supplier_id UUID,
  currency TEXT NOT NULL CHECK (currency IN ('XOF','XAF','CNY','USD','EUR','ETB')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('recorded','reversed')),
  corrects_expenditure_id UUID UNIQUE REFERENCES procurement_expenditures(id),
  correction_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL CHECK (created_at >= 0),
  payload_json JSONB NOT NULL,
  FOREIGN KEY (order_entity_type, order_id) REFERENCES sync_entities(entity_type, entity_id),
  CHECK ((status = 'recorded' AND corrects_expenditure_id IS NULL AND correction_reason IS NULL)
    OR (status = 'reversed' AND corrects_expenditure_id IS NOT NULL AND corrects_expenditure_id <> id AND length(trim(correction_reason)) BETWEEN 1 AND 1000))
);
CREATE INDEX procurement_expenditures_order_idx ON procurement_expenditures(order_id, currency);

CREATE FUNCTION preserve_procurement_expenditure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'procurement expenditures are append-only';
END;
$$;
CREATE TRIGGER procurement_expenditures_immutable BEFORE UPDATE OR DELETE ON procurement_expenditures
FOR EACH ROW EXECUTE FUNCTION preserve_procurement_expenditure();
