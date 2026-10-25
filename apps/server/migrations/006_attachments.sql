CREATE TABLE attachments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('purchase_order','receipt','procurement_expenditure')),
  owner_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  country_id UUID NOT NULL REFERENCES countries(id),
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_length BIGINT NOT NULL CHECK (byte_length BETWEEN 1 AND 104857600),
  checksum CHAR(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  object_key TEXT NOT NULL UNIQUE,
  version_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending_upload','uploaded')),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  payload_json JSONB NOT NULL
);
CREATE INDEX attachments_order_idx ON attachments(order_id);
CREATE INDEX attachments_owner_idx ON attachments(owner_type,owner_id);
CREATE TABLE attachment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL REFERENCES attachments(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('prepared','verified','download_authorized')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE FUNCTION preserve_attachment_archive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'uploaded' OR
     (to_jsonb(OLD) - 'status' - 'version_id') IS DISTINCT FROM (to_jsonb(NEW) - 'status' - 'version_id') THEN
    RAISE EXCEPTION 'attachment archive is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attachment_archive_immutable BEFORE UPDATE OR DELETE ON attachments
FOR EACH ROW EXECUTE FUNCTION preserve_attachment_archive();
