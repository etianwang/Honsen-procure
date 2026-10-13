CREATE TABLE local_authorization_snapshots_new (
  account_id TEXT NOT NULL REFERENCES local_accounts(id),
  project_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, project_id, department_id, team_id),
  CHECK (expires_at > verified_at)
);

INSERT INTO local_authorization_snapshots_new
SELECT account_id, project_id, department_id, team_id, verified_at, expires_at
FROM local_authorization_snapshots;

DROP TABLE local_authorization_snapshots;
ALTER TABLE local_authorization_snapshots_new RENAME TO local_authorization_snapshots;

CREATE INDEX local_authorization_snapshots_active_idx
  ON local_authorization_snapshots (account_id, expires_at, project_id);
