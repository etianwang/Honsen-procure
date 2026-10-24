-- Run after migrations as honsen_procure_migrator while connected to honsen_procure.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO honsen_procure_runtime;
GRANT CONNECT ON DATABASE honsen_procure TO honsen_procure_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO honsen_procure_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO honsen_procure_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE honsen_procure_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO honsen_procure_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE honsen_procure_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO honsen_procure_runtime;
