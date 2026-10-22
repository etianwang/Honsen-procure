SELECT set_config('honsen.deploy_disable_role', :'role', false);
DO $gate$
DECLARE name text := current_setting('honsen.deploy_disable_role');
BEGIN
  IF name = current_user OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = name AND NOT rolsuper
      AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'refusing to disable missing or privileged role';
  END IF;
  EXECUTE format('ALTER ROLE %I NOLOGIN', name);
END
$gate$;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE usename = current_setting('honsen.deploy_disable_role') AND pid <> pg_backend_pid();
DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_setting('honsen.deploy_disable_role') AND rolcanlogin)
     OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename = current_setting('honsen.deploy_disable_role')) THEN
    RAISE EXCEPTION 'failed role remains active';
  END IF;
END
$verify$;
