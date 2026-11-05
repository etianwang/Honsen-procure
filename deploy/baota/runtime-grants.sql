-- Run as migration owner with psql -v runtime_role=honsen_api -f ...
-- The existing role must be LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON users, user_roles, account_sessions,
  countries, projects, departments, teams, user_project_bindings,
  user_project_scope_bindings, sites, units, tax_templates, exchange_rates,
  project_print_defaults, sync_entities, sync_events, sync_conflicts,
  sync_origin_quarantine, formal_issue_registry TO :"runtime_role";
GRANT SELECT, INSERT ON audit_entries TO :"runtime_role";
-- Later payment/archive/quarantine grants are deliberately controlled separately
-- by deploy/linux/grant-api.cjs and api-grant-policy.json. No blanket table grant.
COMMIT;
