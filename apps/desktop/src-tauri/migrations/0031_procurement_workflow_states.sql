CREATE TEMP TABLE local_order_workflow_status_backup AS
SELECT id, workflow_status FROM local_purchase_orders;

DROP INDEX local_purchase_orders_workflow_status_idx;

ALTER TABLE local_purchase_orders DROP COLUMN workflow_status;

ALTER TABLE local_purchase_orders
  ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (workflow_status IN (
    'draft', 'pending_confirmation', 'rejected', 'confirmed',
    'approved', 'formally_issued', 'executing', 'receiving',
    'sent', 'completed', 'completed_with_conditions', 'cancelled'
  ));

UPDATE local_purchase_orders
SET workflow_status = (
  SELECT backup.workflow_status
  FROM local_order_workflow_status_backup backup
  WHERE backup.id = local_purchase_orders.id
);

DROP TABLE local_order_workflow_status_backup;

CREATE INDEX local_purchase_orders_workflow_status_idx
  ON local_purchase_orders (project_id, workflow_status, updated_at DESC);
