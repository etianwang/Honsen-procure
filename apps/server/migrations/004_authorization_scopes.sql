CREATE TABLE user_project_scope_bindings (
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, project_id, department_id, team_id),
  FOREIGN KEY (user_id, project_id) REFERENCES user_project_bindings(user_id, project_id)
);

CREATE INDEX user_project_scope_bindings_active_user_idx
  ON user_project_scope_bindings (user_id, project_id)
  WHERE deleted_at IS NULL;
