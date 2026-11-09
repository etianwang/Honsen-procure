-- T04: record every member of a historical duplicate-code group without
-- changing category IDs, codes, references, events, or audit entries.
-- Safety: scans existing category entities; requires migration-runner transaction.
-- Rollback: retain this table until all quarantine and recovery records are
-- exported; dropping it would lose the record of administrative decisions.
CREATE TABLE category_code_quarantine (
  entity_id UUID PRIMARY KEY,
  business_code TEXT COLLATE "C" NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved'))
);

WITH categories AS (
  SELECT entity_id,
    COALESCE(payload_json->>'businessCode', payload_json->>'business_code') COLLATE "C" AS business_code
  FROM sync_entities WHERE entity_type = 'material_category'
), duplicate_codes AS (
  SELECT business_code FROM categories WHERE business_code IS NOT NULL
  GROUP BY business_code HAVING COUNT(*) > 1
)
INSERT INTO category_code_quarantine (entity_id, business_code)
SELECT c.entity_id, c.business_code FROM categories c
JOIN duplicate_codes d ON d.business_code = c.business_code;
