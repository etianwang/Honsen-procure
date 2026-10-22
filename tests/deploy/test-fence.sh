#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
old="gate_old_${RANDOM}_$$"; new="gate_new_${RANDOM}_$$"; other="gate_other_${RANDOM}_$$"; table="gate_proof_${RANDOM}_$$"
created=0
cleanup() {
  [[ $created == 1 ]] || return 0
  psql -X -v ON_ERROR_STOP=1 -v t="$table" -v old="$old" -v new="$new" -v other="$other" <<'SQL' >/dev/null
DROP TABLE IF EXISTS :"t";
DROP ROLE IF EXISTS :"old";
DROP ROLE IF EXISTS :"new";
DROP ROLE IF EXISTS :"other";
SQL
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -v t="$table" -v old="$old" -v new="$new" <<'SQL' >/dev/null
CREATE ROLE :"old" LOGIN PASSWORD 'isolated-test-only';
CREATE ROLE :"new" NOLOGIN PASSWORD 'isolated-test-only';
CREATE TABLE :"t" (value integer);
GRANT INSERT ON :"t" TO :"old";
GRANT INSERT ON :"t" TO :"new";
SQL
created=1
psql -X -v ON_ERROR_STOP=1 -v other="$other" <<'SQL' >/dev/null
CREATE ROLE :"other" LOGIN;
SQL
if psql -X -v ON_ERROR_STOP=1 -v old_role="$old" -v new_role="$new" -f deploy/linux/fence-writers.sql >/dev/null 2>&1; then
  echo 'unexpected additional login role was accepted' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -v other="$other" <<'SQL' >/dev/null
DROP ROLE :"other";
SQL
psql -X -v ON_ERROR_STOP=1 -v t="$table" -v old="$old" <<'SQL' >/dev/null
ALTER TABLE :"t" OWNER TO :"old";
SQL
if psql -X -v ON_ERROR_STOP=1 -v old_role="$old" -v new_role="$new" -f deploy/linux/fence-writers.sql >/dev/null 2>&1; then
  echo 'role owning objects was accepted' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -v t="$table" -v old="$old" -v new="$new" <<'SQL' >/dev/null
ALTER TABLE :"t" OWNER TO CURRENT_USER;
GRANT INSERT ON :"t" TO :"old";
GRANT INSERT ON :"t" TO :"new";
SQL
psql -X -v ON_ERROR_STOP=1 -v old="$old" -v new="$new" <<'SQL' >/dev/null
GRANT :"old" TO :"new";
SQL
if psql -X -v ON_ERROR_STOP=1 -v old_role="$old" -v new_role="$new" -f deploy/linux/fence-writers.sql >/dev/null 2>&1; then
  echo 'role membership was accepted' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -v old="$old" -v new="$new" <<'SQL' >/dev/null
REVOKE :"old" FROM :"new";
SQL
PGUSER="$old" PGPASSWORD=isolated-test-only psql -X -v ON_ERROR_STOP=1 -v t="$table" <<'SQL' >/dev/null
INSERT INTO :"t" VALUES (1);
SQL
PGUSER="$old" PGPASSWORD=isolated-test-only psql -X -c 'SELECT pg_sleep(30)' >/dev/null 2>&1 &
old_pid=$!
for _ in {1..100}; do
  if [[ $(psql -X -At -v old="$old" <<'SQL'
SELECT count(*) FROM pg_stat_activity WHERE usename = :'old';
SQL
) -gt 0 ]]; then break; fi
  sleep 0.05
done
[[ $(psql -X -At -v old="$old" <<'SQL'
SELECT count(*) FROM pg_stat_activity WHERE usename = :'old';
SQL
) -gt 0 ]]
psql -X -v ON_ERROR_STOP=1 -v old_role="$old" -v new_role="$new" -f deploy/linux/fence-writers.sql >/dev/null
if wait "$old_pid"; then
  echo 'existing old role connection unexpectedly survived' >&2; exit 1
fi
if PGUSER="$old" PGPASSWORD=isolated-test-only psql -X -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'old role unexpectedly connected after fencing' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -v old_role="$old" -v new_role="$new" -f deploy/linux/activate-new-role.sql >/dev/null
PGUSER="$new" PGPASSWORD=isolated-test-only psql -X -v ON_ERROR_STOP=1 -v t="$table" <<'SQL' >/dev/null
INSERT INTO :"t" VALUES (2);
SQL
PGUSER="$new" PGPASSWORD=isolated-test-only psql -X -c 'SELECT pg_sleep(30)' >/dev/null 2>&1 &
new_pid=$!
for _ in {1..100}; do
  if [[ $(psql -X -At -v role="$new" <<'SQL'
SELECT count(*) FROM pg_stat_activity WHERE usename = :'role';
SQL
) -gt 0 ]]; then break; fi
  sleep 0.05
done
psql -X -v ON_ERROR_STOP=1 -v role="$new" -f deploy/linux/disable-role.sql >/dev/null
if wait "$new_pid"; then echo 'new session survived failure fencing' >&2; exit 1; fi
if PGUSER="$new" PGPASSWORD=isolated-test-only psql -X -c 'SELECT 1' >/dev/null 2>&1; then echo 'new role still accepts login' >&2; exit 1; fi
