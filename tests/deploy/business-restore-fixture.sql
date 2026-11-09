-- Synthetic database archive fixture. No credential is usable for login.
DO $$
DECLARE
 actor uuid := gen_random_uuid(); country uuid := gen_random_uuid(); project uuid := gen_random_uuid();
 ord uuid := gen_random_uuid(); pay uuid := gen_random_uuid(); reversal uuid := gen_random_uuid();
 installation uuid := gen_random_uuid(); snapshot jsonb; model jsonb;
BEGIN
 SELECT payload INTO model FROM restore_payload;
 actor := (model->>'applicantId')::uuid; country := (model->>'countryId')::uuid; project := (model->>'projectId')::uuid; ord := (model->>'id')::uuid; installation := (model->>'formalInstallationId')::uuid;
 INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES(actor,'RESTORE-ACTOR','synthetic-restore-actor','NOT-A-LOGIN-HASH','fr-FR');
 INSERT INTO countries(id,business_code,name,time_zone) VALUES(country,'RESTORE-COUNTRY','Synthetic country','UTC');
 INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES(project,country,'RESTORE-PROJECT','Projet 合成 Échantillon','Synthetic site','Synthetic department','XOF','zh_fr');
 snapshot := (model->>'formalSnapshotJson')::jsonb;
 INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('purchase_order',ord,1,model,actor);
 INSERT INTO formal_issue_registry(order_id,document_type,formal_document_no,formal_installation_id,formal_sequence,formal_snapshot_json) VALUES(ord,'SPO',model->>'formalDocumentNo',installation,1,snapshot);
 INSERT INTO procurement_expenditures(id,order_id,project_id,country_id,currency,amount_minor,status,created_by,created_at,payload_json) VALUES(pay,ord,project,country,'XOF',300,'recorded',actor,1,jsonb_build_object('orderId',ord,'amountMinor',300,'status','recorded'));
 INSERT INTO procurement_expenditures(id,order_id,project_id,country_id,currency,amount_minor,status,corrects_expenditure_id,correction_reason,created_by,created_at,payload_json) VALUES(reversal,ord,project,country,'XOF',50,'reversed',pay,'Synthetic partial correction',actor,2,jsonb_build_object('orderId',ord,'amountMinor',50,'status','reversed','correctsExpenditureId',pay));
 INSERT INTO attachments(id,order_id,owner_type,owner_id,project_id,country_id,original_name,content_type,byte_length,checksum,object_key,status,uploaded_by,created_at,payload_json) VALUES(gen_random_uuid(),ord,'procurement_expenditure',pay,project,country,'synthetic-proof.pdf','application/pdf',10,repeat('a',64),'synthetic-restore-reference/not-uploaded','uploaded',actor,3,jsonb_build_object('orderId',ord,'ownerId',pay));
 INSERT INTO sync_events(event_id,installation_id,actor_id,entity_type,entity_id,operation,base_version,result_status,server_version) VALUES(gen_random_uuid(),installation,actor,'purchase_order',ord,'upsert',0,'accepted',1);
END $$;
