CREATE TABLE catalog_sync_quarantine (
  source_key TEXT PRIMARY KEY,
  change_sequence BIGINT REFERENCES server_change_log(sequence),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('material', 'supplier', 'material_price')),
  entity_id UUID NOT NULL,
  server_version BIGINT NOT NULL,
  original_payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_event_id UUID REFERENCES sync_events(event_id),
  resolved_at TIMESTAMPTZ
);

-- Malformed routing/reference fields may never be selected by any scoped Pull.
INSERT INTO catalog_sync_quarantine(source_key,change_sequence,entity_type,entity_id,server_version,original_payload,reason)
SELECT 'change:' || c.sequence::text,c.sequence,c.entity_type,c.entity_id,c.version,c.payload_json,'MANUAL_REVIEW_REQUIRED'
FROM server_change_log c WHERE c.operation = 'upsert' AND c.entity_type IN ('supplier','material_price') AND (
  LOWER(c.payload_json->>'id') IS DISTINCT FROM c.entity_id::text
  OR (c.entity_type = 'supplier' AND NOT EXISTS (
    SELECT 1 FROM countries country WHERE country.id::text = LOWER(COALESCE(c.payload_json->>'countryId',c.payload_json->>'country_id'))
  ))
  OR (c.entity_type = 'material_price' AND (
    NOT EXISTS (SELECT 1 FROM sync_entities s WHERE s.entity_type = 'supplier' AND s.entity_id::text = LOWER(COALESCE(c.payload_json->>'supplierId',c.payload_json->>'supplier_id')))
    OR NOT EXISTS (SELECT 1 FROM sync_entities m WHERE m.entity_type = 'material' AND m.entity_id::text = LOWER(COALESCE(c.payload_json->>'materialId',c.payload_json->>'material_id')))
  ))
) ON CONFLICT(source_key) DO NOTHING;
CREATE INDEX catalog_sync_quarantine_unresolved_idx ON catalog_sync_quarantine(entity_type, entity_id)
  WHERE resolved_at IS NULL;

-- Preserve structurally incomplete pre-fix history even when its missing country prevents scoped Pull.
-- Full schema validation and legacy normalization are performed by the trusted sync service.
INSERT INTO catalog_sync_quarantine(source_key,change_sequence,entity_type,entity_id,server_version,original_payload,reason)
SELECT 'change:' || sequence::text, sequence, entity_type, entity_id, version, payload_json, 'MANUAL_REVIEW_REQUIRED'
FROM server_change_log
WHERE operation = 'upsert' AND (
  (entity_type = 'supplier' AND NOT (payload_json ?& ARRAY['id','name','version']
    AND (payload_json ? 'businessCode' OR payload_json ? 'business_code')
    AND (payload_json ? 'countryId' OR payload_json ? 'country_id')
    AND (payload_json ? 'isActive' OR payload_json ? 'is_active')
    AND (payload_json ? 'isPreferred' OR payload_json ? 'is_preferred')
    AND (payload_json ? 'isBlacklisted' OR payload_json ? 'is_blacklisted')))
  OR (entity_type = 'material_price' AND NOT (payload_json ?& ARRAY['id','currency','unit','version']
    AND (payload_json ? 'materialId' OR payload_json ? 'material_id')
    AND (payload_json ? 'supplierId' OR payload_json ? 'supplier_id')
    AND (payload_json ? 'unitPriceMinor' OR payload_json ? 'unit_price_minor')
    AND (payload_json ? 'effectiveAt' OR payload_json ? 'effective_at')))
) ON CONFLICT(source_key) DO NOTHING;
