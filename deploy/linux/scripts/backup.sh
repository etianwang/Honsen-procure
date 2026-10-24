#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${POSTGRES_URL:?POSTGRES_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
backup_dir="$(realpath -m "$BACKUP_DIR")"
case "$backup_dir" in *honsen-procure*) ;; *) echo 'BACKUP_DIR must be a dedicated honsen-procure directory' >&2; exit 1;; esac
mkdir -p "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$backup_dir/honsen-procure-$stamp.dump"
temporary="$final.partial"
trap 'rm -f -- "$temporary"' EXIT
pg_dump --format=custom --file "$temporary" "$POSTGRES_URL"
pg_restore --list "$temporary" >/dev/null
mv -- "$temporary" "$final"
trap - EXIT

echo "backup verified: $final"
