ALTER TABLE attachment_uploads DROP CONSTRAINT attachment_uploads_owner_type_check;
ALTER TABLE attachment_uploads ADD CONSTRAINT attachment_uploads_owner_type_check
  CHECK (owner_type IN ('procurement_expenditure', 'receipt'));
