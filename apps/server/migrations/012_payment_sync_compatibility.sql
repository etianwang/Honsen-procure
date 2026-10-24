-- Preserve original sync entity/change payloads. Only the read projection supplies
-- fields absent from the baseline payment envelope, using recorded server provenance.
CREATE FUNCTION canonical_procurement_payment(payload JSONB, actor UUID, recorded_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE SQL STABLE AS $$
  SELECT jsonb_build_object(
    'countryId', (SELECT o.payload_json->'countryId' FROM sync_entities o WHERE o.entity_type='purchase_order' AND o.entity_id::text=payload->>'orderId'),
    'paymentType', 'other',
    'createdBy', actor,
    'createdAt', floor(extract(epoch FROM recorded_at))::BIGINT
  ) || payload
$$;

-- Baseline payments were stored in the generic sync journal before the append-only
-- accounting table existed. Register them without rewriting their archived payloads.
INSERT INTO procurement_expenditures
(id,order_id,project_id,country_id,parent_order_id,supplier_id,currency,amount_minor,status,corrects_expenditure_id,correction_reason,created_by,created_at,payload_json)
SELECT e.entity_id,(p->>'orderId')::UUID,(p->>'projectId')::UUID,(p->>'countryId')::UUID,
       (o.payload_json->>'parentOrderId')::UUID,(p->>'supplierId')::UUID,p->>'currency',
       (p->>'amountMinor')::BIGINT,p->>'status',(p->>'correctsExpenditureId')::UUID,
       p->>'correctionReason',(p->>'createdBy')::UUID,(p->>'createdAt')::BIGINT,p
FROM sync_entities e
JOIN sync_entities o ON o.entity_type='purchase_order' AND o.entity_id::text=e.payload_json->>'orderId'
CROSS JOIN LATERAL (SELECT canonical_procurement_payment(e.payload_json,e.updated_by,e.updated_at) AS p) canonical
WHERE e.entity_type='procurement_expenditure' AND NOT e.is_deleted
  AND NOT (e.payload_json ? 'countryId')
  AND NOT EXISTS(SELECT 1 FROM procurement_expenditures ledger WHERE ledger.id=e.entity_id);
