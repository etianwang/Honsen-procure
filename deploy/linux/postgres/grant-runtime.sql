-- Run after migrations as honsen_procure_migrator while connected to honsen_procure.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO honsen_procure_runtime;
GRANT CONNECT ON DATABASE honsen_procure TO honsen_procure_runtime;
GRANT SELECT, INSERT, UPDATE ON users, user_roles, account_sessions,
  countries, projects, departments, teams, user_project_bindings,
  user_project_scope_bindings, sites, units, tax_templates, exchange_rates,
  project_print_defaults, sync_entities, sync_events, sync_conflicts,
  audit_entries TO honsen_procure_runtime;
-- Remaining objects use the reviewed grant-api.cjs policy after migration.
