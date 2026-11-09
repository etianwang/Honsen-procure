ALTER TABLE local_attachment_transfers ADD COLUMN source_attachment_id TEXT
  REFERENCES local_order_attachments(id);
CREATE UNIQUE INDEX local_attachment_derivation_source_idx
  ON local_attachment_transfers(source_attachment_id) WHERE source_attachment_id IS NOT NULL;
CREATE TRIGGER local_attachment_source_immutable
BEFORE UPDATE OF source_attachment_id ON local_attachment_transfers
WHEN OLD.source_attachment_id IS NOT NEW.source_attachment_id
BEGIN
  SELECT RAISE(ABORT, 'attachment derivation is immutable');
END;
