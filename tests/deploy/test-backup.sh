#!/usr/bin/env bash
set -euo pipefail
: "${HONSEN_DEPLOY_TEST:?set HONSEN_DEPLOY_TEST for a disposable PostgreSQL instance}"
[[ "$HONSEN_DEPLOY_TEST" == 1 ]]
: "${TEST_BACKUP_DIR:?use a task-owned directory}"
name="honsen_deploy_test_${RANDOM}_$$"
restore="${name}_restore"
created=0
restored=0
cleanup() {
  if [[ $restored == 1 ]]; then dropdb "$restore" >/dev/null; fi
  if [[ $created == 1 ]]; then dropdb "$name" >/dev/null; fi
}
trap cleanup EXIT
createdb "$name"
created=1
PGDATABASE="$name" psql -v ON_ERROR_STOP=1 -c "CREATE TABLE proof (value text NOT NULL); INSERT INTO proof VALUES ('recoverable');" >/dev/null
PGDATABASE="$name" bash deploy/linux/backup.sh "$TEST_BACKUP_DIR" > "$TEST_BACKUP_DIR/result"
archive=$(cat "$TEST_BACKUP_DIR/result")
createdb "$restore"
restored=1
pg_restore --dbname="$restore" --exit-on-error --no-owner --no-privileges "$archive"
[[ "$(PGDATABASE="$restore" psql -Atqc 'SELECT value FROM proof')" == recoverable ]]
[[ "$(stat -c %a "$archive")" == 600 ]]
