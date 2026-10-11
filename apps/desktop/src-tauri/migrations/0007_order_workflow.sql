ALTER TABLE local_purchase_orders
  ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (workflow_status IN ('draft', 'pending_confirmation', 'rejected', 'confirmed', 'sent', 'completed', 'completed_with_conditions', 'cancelled'));

ALTER TABLE local_purchase_orders
  ADD COLUMN rejection_reason TEXT;

ALTER TABLE local_purchase_orders
  ADD COLUMN confirmed_by TEXT;

ALTER TABLE local_purchase_orders
  ADD COLUMN confirmed_at INTEGER;

UPDATE local_purchase_orders
SET workflow_status = status;

CREATE INDEX local_purchase_orders_workflow_status_idx
  ON local_purchase_orders (project_id, workflow_status, updated_at DESC);

CREATE TABLE local_order_comments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  author_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX local_order_comments_order_created_idx
  ON local_order_comments (order_id, created_at);

CREATE TABLE local_order_audit_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  previous_json TEXT,
  next_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX local_order_audit_entries_order_created_idx
  ON local_order_audit_entries (order_id, created_at);
