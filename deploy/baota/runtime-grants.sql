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

-- Fresh initialization only: exact reviewed later-migration privileges.
BEGIN;
GRANT SELECT, INSERT, UPDATE ON server_change_log, catalog_sync_quarantine TO :"runtime_role";
GRANT USAGE ON SEQUENCE server_change_log_sequence_seq TO :"runtime_role";
GRANT SELECT, INSERT ON procurement_expenditures, attachment_audit,
  category_code_repairs, payment_conflict_resolutions TO :"runtime_role";
GRANT SELECT, UPDATE ON category_code_quarantine TO :"runtime_role";
GRANT SELECT, INSERT ON attachments TO :"runtime_role";
GRANT UPDATE(status, version_id) ON attachments TO :"runtime_role";
REVOKE ALL ON FUNCTION preserve_procurement_expenditure(), preserve_attachment_archive(),
  guard_category_business_code(), canonical_procurement_payment(jsonb,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION canonical_procurement_payment(jsonb,uuid,timestamptz) TO :"runtime_role";
COMMIT;
