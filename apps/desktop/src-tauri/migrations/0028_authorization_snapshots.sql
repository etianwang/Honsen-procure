CREATE TABLE local_authorization_snapshots (
  account_id TEXT NOT NULL REFERENCES local_accounts(id),
  project_id TEXT NOT NULL REFERENCES local_projects(id),
  department_id TEXT NOT NULL REFERENCES local_departments(id),
  team_id TEXT NOT NULL REFERENCES local_teams(id),
  verified_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, project_id, department_id, team_id),
  CHECK (expires_at > verified_at)
);

CREATE INDEX local_authorization_snapshots_active_idx
  ON local_authorization_snapshots (account_id, expires_at, project_id);
