-- Applied after migration while both application roles are fenced.
BEGIN;
SELECT set_config('honsen.api_role', :'new_role', true);
DO $grant$
DECLARE role_name text := current_setting('honsen.api_role');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name AND NOT rolcanlogin
                 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
                 AND NOT rolreplication AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'API role is not safely fenced';
  END IF;
  IF to_regclass('public.formal_issue_registry') IS NULL THEN
    RAISE EXCEPTION 'required registry is missing';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', role_name);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.formal_issue_registry TO %I', role_name);
  IF to_regclass('public.server_change_log_sequence_seq') IS NULL THEN
    RAISE EXCEPTION 'required change-log sequence is missing';
  END IF;
  EXECUTE format('GRANT USAGE ON SEQUENCE public.server_change_log_sequence_seq TO %I', role_name);
END
$grant$;
COMMIT;
