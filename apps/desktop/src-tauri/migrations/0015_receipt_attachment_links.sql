CREATE TABLE local_receipt_attachment_links (
  receipt_id TEXT NOT NULL REFERENCES local_receipts(id),
  attachment_id TEXT NOT NULL REFERENCES local_order_attachments(id),
  PRIMARY KEY (receipt_id, attachment_id)
);

CREATE INDEX local_receipt_attachment_links_attachment_idx
  ON local_receipt_attachment_links (attachment_id);
