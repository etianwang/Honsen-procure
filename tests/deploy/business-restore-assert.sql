DO $$
DECLARE expected integer; actual integer;
BEGIN
 SELECT count(*) INTO actual FROM schema_migrations WHERE checksum ~ '^[a-f0-9]{64}$';
 IF actual = 0 THEN RAISE EXCEPTION 'missing migration checksums'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND NOT convalidated) THEN RAISE EXCEPTION 'unvalidated foreign key'; END IF;
 SELECT count(*) INTO actual FROM procurement_expenditures r JOIN procurement_expenditures p ON r.corrects_expenditure_id=p.id JOIN sync_entities o ON o.entity_type='purchase_order' AND o.entity_id=p.order_id WHERE r.status='reversed' AND p.amount_minor-r.amount_minor=250 AND o.payload_json->>'workflowStatus'='completed';
 IF actual <> 1 THEN RAISE EXCEPTION 'history or reversal relationship lost'; END IF;
 SELECT count(*) INTO actual FROM formal_issue_registry f JOIN sync_entities o ON o.entity_id=f.order_id AND o.entity_type='purchase_order' JOIN attachments a ON a.order_id=f.order_id JOIN procurement_expenditures p ON a.owner_id=p.id WHERE f.formal_document_no=o.payload_json->>'formalDocumentNo' AND f.formal_snapshot_json=(o.payload_json->>'formalSnapshotJson')::jsonb AND f.formal_snapshot_json->>'workflowStatus'='draft' AND a.status='uploaded';
 IF actual <> 1 THEN RAISE EXCEPTION 'formal snapshot or attachment reference lost'; END IF;
 BEGIN
   UPDATE procurement_expenditures SET amount_minor=999;
   RAISE EXCEPTION 'immutable ledger update unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'procurement expenditures are append-only' THEN RAISE; END IF;
 END;
 BEGIN
   DELETE FROM attachments;
   RAISE EXCEPTION 'immutable attachment delete unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'attachment archive is immutable' THEN RAISE; END IF;
 END;
END $$;
