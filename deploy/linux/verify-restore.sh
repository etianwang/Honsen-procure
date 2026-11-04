#!/usr/bin/env bash
# Restore to a disposable database on a separate PostgreSQL cluster.
set -euo pipefail
umask 077
: "${PGDATABASE:?}" "${RESTORE_SERVICE:?}" "${PGSERVICEFILE:?}" "${PGPASSFILE:?}"
[[ $# == 1 && -f $1 && ! -L $1 && $RESTORE_SERVICE =~ ^[A-Za-z0-9_.-]+$ ]] || exit 2
[[ -f $PGSERVICEFILE && -f $PGPASSFILE && $(stat -c %a "$PGPASSFILE") == 600 ]] || exit 2
archive=$1
restore_env=(env -i "PATH=$PATH" "PGSERVICEFILE=$PGSERVICEFILE" "PGPASSFILE=$PGPASSFILE" PGCONNECT_TIMEOUT=5)
admin="service=$RESTORE_SERVICE"
source_id=$(psql -X -At -v ON_ERROR_STOP=1 -c 'SELECT system_identifier FROM pg_control_system()')
target_id=$("${restore_env[@]}" psql -X -At -v ON_ERROR_STOP=1 --dbname="$admin" -c 'SELECT system_identifier FROM pg_control_system()')
[[ -n $source_id && -n $target_id && $source_id != "$target_id" ]] || { echo 'restore verification requires a separate PostgreSQL cluster' >&2; exit 1; }
counts_sql="SELECT (SELECT count(*) FROM public.schema_migrations)::text || ':' || (SELECT count(*) FROM public.sync_entities)::text || ':' || (SELECT count(*) FROM public.sync_events)::text"
source_counts=$(psql -X -At -v ON_ERROR_STOP=1 -c "$counts_sql")
# Compare every public table, including immutable ledger and attachment references.
# Identifiers are quoted by PostgreSQL; C ordering is independent of locale.
# Hashes and rows never enter logs. Run against a quiescent source backup.
fingerprint_sql="SELECT format('SELECT %L; SELECT row_to_json(t)::text FROM %I.%I t ORDER BY row_to_json(t)::text COLLATE \"C\";', tablename, schemaname, tablename) FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename COLLATE \"C\";"
fingerprint() {
  local connection=$1; shift
  { printf '%s\n' "SET timezone = 'UTC'; SET datestyle = 'ISO, YMD'; SET extra_float_digits = 3;" "$fingerprint_sql"; printf '\\gexec\n'; } |
    "$@" psql -X -qAt -v ON_ERROR_STOP=1 --dbname="$connection" | sha256sum | cut -d ' ' -f 1
}
source_fingerprint=$(fingerprint "$PGDATABASE" env)
name="honsen_restore_$(tr -d - < /proc/sys/kernel/random/uuid)"
created=0
cleanup() {
  if [[ $created == 1 ]]; then
    "${restore_env[@]}" dropdb --maintenance-db="$admin" --if-exists "$name" || echo "WARNING: disposable restore database $name requires cleanup" >&2
  fi
}
trap cleanup EXIT
"${restore_env[@]}" createdb --maintenance-db="$admin" "$name"
created=1
"${restore_env[@]}" pg_restore --exit-on-error --no-owner --no-privileges --dbname="$admin dbname=$name" "$archive"
restored_counts=$("${restore_env[@]}" psql -X -At -v ON_ERROR_STOP=1 --dbname="$admin dbname=$name" -c "$counts_sql")
restored_fingerprint=$(fingerprint "$admin dbname=$name" "${restore_env[@]}")
[[ $source_fingerprint == "$restored_fingerprint" ]] || { echo 'restored public table contents differ' >&2; exit 1; }
[[ $source_counts == "$restored_counts" ]] || { echo 'restored key table counts differ' >&2; exit 1; }
"${restore_env[@]}" dropdb --maintenance-db="$admin" "$name"
created=0
echo 'separate-cluster restore verified'
