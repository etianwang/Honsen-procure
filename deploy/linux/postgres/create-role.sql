-- Run as a PostgreSQL superuser against the postgres database:
--   psql -v migrator_password='...' -v runtime_password='...' -f create-role.sql postgres
-- Passwords are psql variables so they do not enter this file or shell history.
\if :{?migrator_password}
\else
\quit 3
\endif
\if :{?runtime_password}
\else
\quit 3
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'honsen_procure_migrator') THEN
    CREATE ROLE honsen_procure_migrator LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'honsen_procure_runtime') THEN
    CREATE ROLE honsen_procure_runtime LOGIN NOINHERIT;
  END IF;
END $$;

ALTER ROLE honsen_procure_migrator PASSWORD :'migrator_password';
ALTER ROLE honsen_procure_runtime PASSWORD :'runtime_password';
REVOKE ALL ON DATABASE postgres FROM honsen_procure_migrator, honsen_procure_runtime;
