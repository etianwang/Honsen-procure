#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${POSTGRES_URL:?POSTGRES_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
backup_dir="$(realpath -m "$BACKUP_DIR")"
case "$backup_dir" in *honsen-procure*) ;; *) echo 'BACKUP_DIR must be a dedicated honsen-procure directory' >&2; exit 1;; esac
mkdir -p "$backup_dir"
owner=$(stat -c %u "$backup_dir")
mode=$(stat -c %a "$backup_dir")
[[ $owner == "$(id -u)" && $mode =~ ^[0-7]{3,4}$ ]] || { echo 'backup directory must be owned by the backup user' >&2; exit 1; }
(( (8#$mode & 8#0022) == 0 )) || { echo 'backup directory must not allow group/world writes' >&2; exit 1; }

lock="$backup_dir/.honsen-procure-backup.lock"
mkdir "$lock" 2>/dev/null || { echo 'backup directory locked; inspect an interrupted backup before retry' >&2; exit 1; }
temporary=''
metadata=''
cleanup() {
  [[ -z $temporary ]] || rm -f -- "$temporary"
  [[ -z $metadata ]] || rm -f -- "$metadata"
  rmdir -- "$lock"
}
trap cleanup EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
uuid=$(cat /proc/sys/kernel/random/uuid)
final="$backup_dir/honsen-procure-managed-v1-$stamp-$uuid.dump"
temporary=$(mktemp "$backup_dir/.honsen-procure-partial-XXXXXXXX")
pg_dump --format=custom --file "$temporary" "$POSTGRES_URL"
pg_restore --list "$temporary" >/dev/null
# Hard-link publication fails if any final path already exists: never overwrite.
ln -- "$temporary" "$final"
rm -- "$temporary"
temporary=''
metadata=$(mktemp "$backup_dir/.honsen-procure-metadata-XXXXXXXX")
sha256sum "$final" | cut -d ' ' -f 1 > "$metadata"
ln -- "$metadata" "$final.verified-sha256"
rm -- "$metadata"
metadata=''

# Only this version's verified, unmodified regular archives are managed.
# Legacy backups, arbitrary files, hard links and symlinks are never pruned.
managed=()
while IFS= read -r -d '' candidate; do
  name=${candidate##*/}
  [[ $name =~ ^honsen-procure-managed-v1-[0-9]{8}T[0-9]{6}Z-[a-f0-9-]{36}\.dump$ ]] || continue
  proof="$candidate.verified-sha256"
  [[ -f $candidate && ! -L $candidate && -f $proof && ! -L $proof ]] || continue
  [[ $(stat -c %h "$candidate") == 1 && $(stat -c %h "$proof") == 1 ]] || continue
  expected=$(cat "$proof")
  [[ $expected =~ ^[a-f0-9]{64}$ ]] || continue
  [[ $(sha256sum "$candidate" | cut -d ' ' -f 1) == "$expected" ]] || continue
  managed+=("$candidate")
  # Serialized dumps have ordered mtimes, including nanoseconds; UUID lexical
  # order does not describe recency when several backups share one second.
  position=$((${#managed[@]} - 1))
  while ((position > 0)) && [[ ${managed[$position]} -nt ${managed[$((position-1))]} ]]; do
    previous=${managed[$((position-1))]}
    managed[$((position-1))]=${managed[$position]}
    managed[$position]=$previous
    position=$((position-1))
  done
done < <(find "$backup_dir" -maxdepth 1 -type f -name 'honsen-procure-managed-v1-*.dump' -print0)
for ((index=10; index<${#managed[@]}; index++)); do
  rm -- "${managed[$index]}" "${managed[$index]}.verified-sha256"
done

echo "backup verified: $final"
