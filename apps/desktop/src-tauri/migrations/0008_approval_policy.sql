ALTER TABLE local_purchase_orders
  ADD COLUMN self_approved INTEGER NOT NULL DEFAULT 0
  CHECK (self_approved IN (0, 1));

CREATE TABLE local_approval_policy (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  allow_self_approval INTEGER NOT NULL DEFAULT 0
    CHECK (allow_self_approval IN (0, 1)),
  updated_by TEXT,
  updated_at INTEGER
);

INSERT INTO local_approval_policy (singleton, allow_self_approval)
VALUES (1, 0);

CREATE TABLE local_approval_policy_audit_entries (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  allow_self_approval INTEGER NOT NULL CHECK (allow_self_approval IN (0, 1)),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at INTEGER NOT NULL
);
