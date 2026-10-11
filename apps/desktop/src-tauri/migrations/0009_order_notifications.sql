CREATE TABLE local_order_notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES local_accounts(id),
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  comment_id TEXT NOT NULL REFERENCES local_order_comments(id),
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE (recipient_id, comment_id)
);

CREATE INDEX local_order_notifications_recipient_created_idx
  ON local_order_notifications (recipient_id, read_at, created_at DESC);
