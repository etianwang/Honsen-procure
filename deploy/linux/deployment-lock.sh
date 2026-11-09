#!/usr/bin/env bash
# A durable lock survives client crashes and requires explicit recovery.
set -euo pipefail
: "${PGDATABASE:?direct PostgreSQL connection required}"
[[ $# == 2 && ( $1 == acquire || $1 == release ) && $2 =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || exit 2
if [[ $1 == acquire ]]; then
  result=$(psql -X -qAt -v ON_ERROR_STOP=1 -v token="$2" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(78136817301300721);
CREATE SCHEMA IF NOT EXISTS honsen_deployment;
REVOKE ALL ON SCHEMA honsen_deployment FROM PUBLIC;
CREATE TABLE IF NOT EXISTS honsen_deployment.controller_lock (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  token uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON honsen_deployment.controller_lock FROM PUBLIC;
WITH acquired AS (
  INSERT INTO honsen_deployment.controller_lock (singleton, token)
  VALUES (true, :'token'::uuid) ON CONFLICT DO NOTHING RETURNING token
)
SELECT COALESCE((SELECT token::text FROM acquired), 'busy');
COMMIT;
SQL
  )
else
  result=$(psql -X -qAt -v ON_ERROR_STOP=1 -v token="$2" <<'SQL'
DELETE FROM honsen_deployment.controller_lock WHERE token = :'token'::uuid RETURNING token;
SQL
  )
fi
[[ ${result//$'\n'/} == "$2" ]] || { echo 'deployment lock is held by another controller or token does not match' >&2; exit 1; }
