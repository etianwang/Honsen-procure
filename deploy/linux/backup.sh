#!/usr/bin/env bash
set -euo pipefail
: "${PGDATABASE:?PGDATABASE is required}"
[[ $# == 1 && -d "$1" ]] || { echo 'existing backup directory required' >&2; exit 2; }
umask 077
archive=$(mktemp "$1/honsen-pg-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX.dump")
complete=0
cleanup() { if [[ $complete == 0 ]]; then rm -f -- "$archive"; fi; }
trap cleanup EXIT
chmod 600 "$archive"
[[ "$(stat -c %a "$archive")" == 600 ]] || { echo 'backup directory does not enforce private permissions' >&2; exit 1; }
pg_dump --format=custom --file="$archive"
pg_restore --list "$archive" >/dev/null
complete=1
printf '%s\n' "$archive"
