-- Run with psql -X -v ON_ERROR_STOP=1 as the dedicated deployment superuser.
-- A separate login role and credential are required for each release.
SELECT set_config('honsen.deploy_old_role', :'old_role', false);
SELECT set_config('honsen.deploy_new_role', :'new_role', false);
DO $gate$
DECLARE
  old_name text := current_setting('honsen.deploy_old_role');
  new_name text := current_setting('honsen.deploy_new_role');
  old_oid oid;
  new_oid oid;
BEGIN
  IF old_name = new_name OR old_name = current_user OR new_name = current_user THEN
    RAISE EXCEPTION 'deployment roles must be distinct';
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'deployment requires a dedicated superuser';
  END IF;
  SELECT oid INTO old_oid FROM pg_roles WHERE rolname = old_name AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls;
  SELECT oid INTO new_oid FROM pg_roles WHERE rolname = new_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls;
  IF old_oid IS NULL OR new_oid IS NULL THEN
    RAISE EXCEPTION 'old or new role is missing, privileged, or new role can already login';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (old_oid, new_oid) OR roleid IN (old_oid, new_oid)) THEN
    RAISE EXCEPTION 'deployment roles must not have role memberships';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND refobjid IN (old_oid, new_oid) AND deptype = 'o') THEN
    RAISE EXCEPTION 'deployment roles must not own database objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolcanlogin AND rolname NOT IN (current_user, old_name, new_name)
             AND has_database_privilege(oid, current_database(), 'CONNECT')) THEN
    RAISE EXCEPTION 'another login role can connect to the database';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND usename <> old_name) THEN
    RAISE EXCEPTION 'another database session is active';
  END IF;
  EXECUTE format('ALTER ROLE %I NOLOGIN', old_name);
END
$gate$;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE usename = current_setting('honsen.deploy_old_role') AND pid <> pg_backend_pid();
DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_setting('honsen.deploy_old_role') AND rolcanlogin)
     OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename = current_setting('honsen.deploy_old_role')) THEN
    RAISE EXCEPTION 'old database role remains active';
  END IF;
END
$verify$;
