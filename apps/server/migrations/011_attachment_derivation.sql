-- Original and JPEG derivative retain separate immutable archives and shared owner scope.
CREATE UNIQUE INDEX attachments_one_heic_derivative_idx
  ON attachments ((payload_json->>'sourceAttachmentId'))
  WHERE payload_json ? 'sourceAttachmentId';
