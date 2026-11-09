#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# == 2 && -f $1 && ! -L $1 && -d $2 && ! -L $2 ]] || { echo 'backup and external directory required' >&2; exit 2; }
archive=$1
external=$2
[[ $(stat -c %a "$archive") == 600 ]] || { echo 'backup permissions are not private' >&2; exit 1; }
local_mount=$(findmnt -n -o MAJ:MIN --target "$archive")
external_mount=$(findmnt -n -o MAJ:MIN --target "$external")
[[ -n $local_mount && -n $external_mount && $local_mount != "$external_mount" ]] || { echo 'external backup storage must be a distinct mounted filesystem' >&2; exit 1; }
pg_restore --exit-on-error --file=/dev/null "$archive"
copy=$(mktemp "$external/.honsen-pg-XXXXXXXX.dump")
complete=0
cleanup() { if [[ $complete == 0 ]]; then rm -f -- "$copy"; fi; }
trap cleanup EXIT
chmod 600 "$copy"
[[ $(stat -c %a "$copy") == 600 ]] || { echo 'external storage does not enforce private permissions' >&2; exit 1; }
cat -- "$archive" > "$copy"
sync -f "$copy"
cmp -s -- "$archive" "$copy"
pg_restore --exit-on-error --file=/dev/null "$copy"
complete=1
printf '%s\n' "$copy"
