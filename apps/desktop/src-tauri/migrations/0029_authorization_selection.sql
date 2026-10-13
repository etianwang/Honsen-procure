CREATE TABLE local_selected_authorization_contexts (
  account_id TEXT PRIMARY KEY REFERENCES local_accounts(id),
  project_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  selected_at INTEGER NOT NULL
);
