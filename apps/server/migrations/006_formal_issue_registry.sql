CREATE TABLE formal_issue_registry (
  order_id UUID PRIMARY KEY,
  document_type TEXT NOT NULL CHECK (document_type IN ('OPA', 'HPA', 'SPO')),
  formal_document_no TEXT NOT NULL UNIQUE CHECK (formal_document_no <> ''),
  formal_installation_id UUID NOT NULL,
  formal_sequence BIGINT NOT NULL CHECK (formal_sequence > 0),
  formal_snapshot_json JSONB NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (formal_installation_id, formal_sequence)
);

-- Previously accepted generic sync rows remain discoverable; duplicate registrations abort migration.
INSERT INTO formal_issue_registry
  (order_id, document_type, formal_document_no, formal_installation_id,
   formal_sequence, formal_snapshot_json)
SELECT entity_id,
       payload_json->>'documentType',
       payload_json->>'formalDocumentNo',
       (payload_json->>'formalInstallationId')::uuid,
       (payload_json->>'formalSequence')::bigint,
       (payload_json->>'formalSnapshotJson')::jsonb
FROM sync_entities
WHERE entity_type = 'purchase_order'
  AND payload_json->>'formalDocumentNo' IS NOT NULL;
