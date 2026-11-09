-- T04: serialize category code claims without rewriting historical entities.
-- Safety: requires a write lock on sync_entities while installing the trigger.
-- Rollback: remove the trigger and function only after disabling new code claims;
-- retain sync_events.result_error_code to preserve recorded conflict results.
ALTER TABLE sync_events ADD COLUMN result_error_code TEXT;

CREATE FUNCTION guard_category_business_code() RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF NEW.entity_type <> 'material_category' THEN RETURN NEW; END IF;
  new_code := COALESCE(NEW.payload_json->>'businessCode', NEW.payload_json->>'business_code');
  IF new_code IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('material_category:' || new_code, 0));
  IF EXISTS (
    SELECT 1 FROM sync_entities
    WHERE entity_type = 'material_category' AND entity_id = NEW.entity_id
      AND COALESCE(payload_json->>'businessCode', payload_json->>'business_code') COLLATE "C" = new_code COLLATE "C"
  ) THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM sync_entities
    WHERE entity_type = 'material_category' AND entity_id <> NEW.entity_id
      AND COALESCE(payload_json->>'businessCode', payload_json->>'business_code') COLLATE "C" = new_code COLLATE "C"
  ) THEN
    RAISE EXCEPTION 'category business code conflict'
      USING ERRCODE = '23505', CONSTRAINT = 'material_category_business_code_unique';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_category_business_code
BEFORE INSERT OR UPDATE ON sync_entities
FOR EACH ROW EXECUTE FUNCTION guard_category_business_code();
