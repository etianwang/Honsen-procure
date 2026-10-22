SELECT set_config('honsen.deploy_old_role', :'old_role', false);
SELECT set_config('honsen.deploy_new_role', :'new_role', false);
DO $gate$
DECLARE old_oid oid; new_oid oid; old_name text := current_setting('honsen.deploy_old_role'); new_name text := current_setting('honsen.deploy_new_role');
BEGIN
  SELECT oid INTO old_oid FROM pg_roles WHERE rolname = old_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls;
  SELECT oid INTO new_oid FROM pg_roles WHERE rolname = new_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls;
  IF old_oid IS NULL OR new_oid IS NULL OR old_oid = new_oid OR current_user IN (old_name, new_name) THEN RAISE EXCEPTION 'role state is not fenced'; END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (old_oid, new_oid) OR roleid IN (old_oid, new_oid)) OR
     EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND refobjid IN (old_oid, new_oid) AND deptype = 'o') OR
     EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename IN (old_name, new_name)) OR
     EXISTS (SELECT 1 FROM pg_roles WHERE rolcanlogin AND rolname NOT IN (current_user, old_name, new_name) AND has_database_privilege(oid, current_database(), 'CONNECT')) THEN
    RAISE EXCEPTION 'writer isolation changed';
  END IF;
  EXECUTE format('ALTER ROLE %I LOGIN', new_name);
END
$gate$;
