#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${POSTGRES_URL:?}"
script=${TEST_BACKUP_SCRIPT:-deploy/linux/scripts/backup.sh}
root=$(mktemp -d /tmp/honsen-procure-retention-XXXXXXXX)
trap 'rm -rf -- "$root"' EXIT
export BACKUP_DIR="$root/backups"
mkdir "$BACKUP_DIR"
printf 'unmanaged synthetic\n' > "$BACKUP_DIR/unmanaged.dump"
printf 'legacy synthetic\n' > "$BACKUP_DIR/honsen-procure-20200101T000000Z.dump"
printf 'outside synthetic\n' > "$root/untouched"
link="$BACKUP_DIR/honsen-procure-managed-v1-20000101T000000Z-00000000-0000-4000-8000-000000000000.dump"
ln -s "$root/untouched" "$link"
printf 'not a verified archive\n' > "$link.verified-sha256"
# Force all 12 calls into the same filename timestamp. Real pg_dump is used.
date() { printf '20261104T000000Z\n'; }
export -f date
paths=()
for ((i=0; i<12; i++)); do
  output=$(bash "$script")
  paths+=("${output#backup verified: }")
done
[[ $(printf '%s\n' "${paths[@]}" | sort -u | wc -l) == 12 ]] || { echo 'same-second backup overwrite detected' >&2; exit 1; }
for ((i=0; i<12; i++)); do
  if ((i<2)); then [[ ! -e ${paths[$i]} && ! -e ${paths[$i]}.verified-sha256 ]];
  else [[ -f ${paths[$i]} && -f ${paths[$i]}.verified-sha256 ]]; pg_restore --list "${paths[$i]}" >/dev/null; fi
done
before=$(find "$BACKUP_DIR" -maxdepth 1 -type f -exec sha256sum '{}' \; | sort | sha256sum)
pg_dump() { return 23; }
export -f pg_dump
if bash "$script" >/dev/null 2>&1; then echo 'failed pg_dump accepted' >&2; exit 1; fi
unset -f pg_dump
after=$(find "$BACKUP_DIR" -maxdepth 1 -type f -exec sha256sum '{}' \; | sort | sha256sum)
[[ $before == "$after" ]]
pg_restore() { return 24; }
export -f pg_restore
if bash "$script" >/dev/null 2>&1; then echo 'unverified archive accepted' >&2; exit 1; fi
unset -f pg_restore
after=$(find "$BACKUP_DIR" -maxdepth 1 -type f -exec sha256sum '{}' \; | sort | sha256sum)
[[ $before == "$after" ]]
[[ -f $BACKUP_DIR/unmanaged.dump && -f $BACKUP_DIR/honsen-procure-20200101T000000Z.dump && -L $link ]]
[[ $(cat "$root/untouched") == 'outside synthetic' ]]
mkdir "$BACKUP_DIR/.honsen-procure-backup.lock"
if bash "$script" >/dev/null 2>&1; then echo 'concurrent/stale lock ignored' >&2; exit 1; fi
[[ -d $BACKUP_DIR/.honsen-procure-backup.lock ]]
rmdir "$BACKUP_DIR/.honsen-procure-backup.lock"
cat() { if [[ $# == 1 && $1 == /proc/sys/kernel/random/uuid ]]; then printf '00000000-0000-4000-8000-000000000001\n'; else command cat "$@"; fi; }
export -f cat
collision_output=$(bash "$script")
collision_file=${collision_output#backup verified: }
collision_hash=$(sha256sum "$collision_file")
if bash "$script" >/dev/null 2>&1; then echo 'existing archive overwritten' >&2; exit 1; fi
[[ $(sha256sum "$collision_file") == "$collision_hash" ]]
unset -f cat
before=$(find "$BACKUP_DIR" -maxdepth 1 -type f -exec sha256sum '{}' \; | sort | sha256sum)
chmod 0777 "$BACKUP_DIR"
if bash "$script" >/dev/null 2>&1; then echo 'world-writable backup directory accepted' >&2; exit 1; fi
after=$(find "$BACKUP_DIR" -maxdepth 1 -type f -exec sha256sum '{}' \; | sort | sha256sum)
[[ $before == "$after" ]]
chmod 0700 "$BACKUP_DIR"
echo 'same-second unique backups, newest10, failure preservation, unmanaged/symlink safety, lock refusal, no-clobber collision: PASS'
