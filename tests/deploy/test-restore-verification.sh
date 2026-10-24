#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${TEST_BACKUP_DIR:?}" "${RESTORE_TEST_PORT:?}" "${RESTORE_TEST_PASSWORD:?}" "${PGPORT:?}" "${PGPASSWORD:?}"
umask 077
export RESTORE_SERVICE=honsen_restore_test
export PGSERVICEFILE="$TEST_BACKUP_DIR/restore-service.conf"
export PGPASSFILE="$TEST_BACKUP_DIR/restore-pgpass"
printf '[%s]\nhost=127.0.0.1\nport=%s\nuser=postgres\ndbname=postgres\n' "$RESTORE_SERVICE" "$RESTORE_TEST_PORT" > "$PGSERVICEFILE"
printf '[honsen_source_test]\nhost=127.0.0.1\nport=%s\nuser=postgres\ndbname=postgres\n' "$PGPORT" >> "$PGSERVICEFILE"
printf '127.0.0.1:%s:*:postgres:%s\n' "$RESTORE_TEST_PORT" "$RESTORE_TEST_PASSWORD" > "$PGPASSFILE"
printf '127.0.0.1:%s:*:postgres:%s\n' "$PGPORT" "$PGPASSWORD" >> "$PGPASSFILE"
fixture="honsen_verify_fixture_${RANDOM}_$$"
createdb "$fixture"
cleanup() { dropdb "$fixture"; }
trap cleanup EXIT
export PGDATABASE="$fixture"
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE schema_migrations (name text);
CREATE TABLE sync_entities (id integer);
CREATE TABLE sync_events (id integer);
INSERT INTO schema_migrations VALUES ('fixture');
INSERT INTO sync_entities VALUES (1), (2);
INSERT INTO sync_events VALUES (1);
SQL
archive=$(bash deploy/linux/backup.sh "$TEST_BACKUP_DIR")
bash deploy/linux/verify-restore.sh "$archive"
if RESTORE_SERVICE=honsen_source_test bash deploy/linux/verify-restore.sh "$archive"; then
  echo 'same-cluster restore was accepted' >&2; exit 1
fi
if bash deploy/linux/verify-restore.sh /dev/null; then
  echo 'invalid backup passed restore verification' >&2; exit 1
fi
echo 'isolated backup restore and invalid archive: PASS'
