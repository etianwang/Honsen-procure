-- Legacy receipt payloads reference pre-managed order attachments. Keep those
-- immutable links even when a second device has not yet recovered the old file.
CREATE TABLE local_receipt_attachment_links_next (
  receipt_id TEXT NOT NULL REFERENCES local_receipts(id),
  attachment_id TEXT NOT NULL,
  PRIMARY KEY (receipt_id, attachment_id)
);

INSERT INTO local_receipt_attachment_links_next (receipt_id, attachment_id)
SELECT receipt_id, attachment_id FROM local_receipt_attachment_links;

DROP TABLE local_receipt_attachment_links;
ALTER TABLE local_receipt_attachment_links_next RENAME TO local_receipt_attachment_links;

CREATE INDEX local_receipt_attachment_links_attachment_idx
  ON local_receipt_attachment_links (attachment_id);
