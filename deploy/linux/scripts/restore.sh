#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${POSTGRES_URL:?POSTGRES_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
test "${RESTORE_CONFIRMATION:-}" = 'I_UNDERSTAND_THIS_REPLACES_THE_DATABASE' || {
  echo 'Set RESTORE_CONFIRMATION=I_UNDERSTAND_THIS_REPLACES_THE_DATABASE to continue' >&2
  exit 1
}
backup_file="$(realpath "$BACKUP_FILE")"
test -f "$backup_file" || { echo "backup not found: $backup_file" >&2; exit 1; }
pg_restore --list "$backup_file" >/dev/null

pre_restore_file="${backup_file%.dump}-pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --file "$pre_restore_file" "$POSTGRES_URL"
pg_restore --list "$pre_restore_file" >/dev/null
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$POSTGRES_URL" "$backup_file"
echo "restore completed; automatic pre-restore backup: $pre_restore_file"
