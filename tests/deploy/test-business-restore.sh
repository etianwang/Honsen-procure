#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${TEST_BACKUP_DIR:?}" "${RESTORE_TEST_PORT:?}" "${PGPORT:?}"
umask 077
source_db="honsen_business_source_${RANDOM}_$$"
target_db="honsen_business_restore_${RANDOM}_$$"
source_created=0
target_created=0
cleanup() {
  if [[ $target_created == 1 ]]; then PGPORT="$RESTORE_TEST_PORT" dropdb "$target_db"; fi
  if [[ $source_created == 1 ]]; then dropdb "$source_db"; fi
}
trap cleanup EXIT
createdb "$source_db"
source_created=1
export PGDATABASE="$source_db"
psql -X -v ON_ERROR_STOP=1 -c 'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text,applied_at timestamptz NOT NULL DEFAULT now())' >/dev/null
# Match the production runner's lexical ordering and exact file SHA-256.
while IFS= read -r migration; do
  name=$(basename "$migration")
  checksum=$(sha256sum "$migration" | cut -d ' ' -f 1)
  { printf 'BEGIN;\n'; cat "$migration"; printf "\nINSERT INTO schema_migrations(name,checksum) VALUES ('%s','%s');\nCOMMIT;\n" "$name" "$checksum"; } | psql -X -q -v ON_ERROR_STOP=1 >/dev/null
done < <(find apps/server/migrations -maxdepth 1 -name '*.sql' | LC_ALL=C sort)
{ cat "${BUSINESS_RESTORE_MODEL_SQL:?Generate with node --import tsx tests/deploy/business-restore-model.mjs}"; cat tests/deploy/business-restore-fixture.sql; } | psql -X -v ON_ERROR_STOP=1 >/dev/null
mkdir -p "$TEST_BACKUP_DIR"
archive=$(bash deploy/linux/backup.sh "$TEST_BACKUP_DIR")
PGPORT="$RESTORE_TEST_PORT" createdb "$target_db"
target_created=1
PGPORT="$RESTORE_TEST_PORT" pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target_db" "$archive"
PGPORT="$RESTORE_TEST_PORT" PGDATABASE="$target_db" psql -X -v ON_ERROR_STOP=1 -f tests/deploy/business-restore-assert.sql >/dev/null
# Exact deterministic public-table content comparison, without printing rows.
dump_rows() {
  local port=$1 database=$2
  { printf "SET timezone='UTC'; SET datestyle='ISO,YMD'; SET extra_float_digits=3;\n"; printf "%s\n" "SELECT format('SELECT %L; SELECT row_to_json(t)::text FROM %I.%I t ORDER BY row_to_json(t)::text COLLATE \"C\";',tablename,schemaname,tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\";"; printf '\\gexec\n'; } | PGPORT="$port" PGDATABASE="$database" psql -X -qAt -v ON_ERROR_STOP=1 | sha256sum | cut -d ' ' -f 1
}
[[ $(dump_rows "$PGPORT" "$source_db") == "$(dump_rows "$RESTORE_TEST_PORT" "$target_db")" ]]
source_cluster=$(psql -X -Atqc 'SELECT system_identifier FROM pg_control_system()')
target_cluster=$(PGPORT="$RESTORE_TEST_PORT" PGDATABASE="$target_db" psql -X -Atqc 'SELECT system_identifier FROM pg_control_system()')
[[ $source_cluster != "$target_cluster" ]]
echo 'real migration schema, independent-cluster restore, all public contents, historical relationships and immutable guards: PASS'
