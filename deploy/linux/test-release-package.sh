#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
required_files=(
  "deploy/linux/honsen-procure.service"
  "deploy/linux/nginx/honsen-procure.conf"
  "deploy/linux/postgres/create-role.sql"
  "deploy/linux/scripts/preflight.sh"
  "deploy/linux/scripts/build-release.sh"
  "deploy/linux/scripts/backup.sh"
  "deploy/linux/scripts/restore.sh"
  "deploy/linux/.env.production.example"
  "deploy/linux/README.zh-CN.md"
)

for file in "${required_files[@]}"; do
  test -f "$root/$file" || { echo "missing: $file" >&2; exit 1; }
done

for script in preflight.sh build-release.sh backup.sh restore.sh; do
  bash -n "$root/deploy/linux/scripts/$script"
  test -x "$root/deploy/linux/scripts/$script" || {
    echo "not executable: deploy/linux/scripts/$script" >&2
    exit 1
  }
done

grep -Fq 'User=honsen-procure' "$root/deploy/linux/honsen-procure.service"
grep -Fq 'proxy_pass http://127.0.0.1:3000' "$root/deploy/linux/nginx/honsen-procure.conf"
grep -Fq 'GRANT CONNECT' "$root/deploy/linux/postgres/create-role.sql"
grep -Fq 'pg_dump --format=custom' "$root/deploy/linux/scripts/backup.sh"
grep -Fq 'I_UNDERSTAND_THIS_REPLACES_THE_DATABASE' "$root/deploy/linux/scripts/restore.sh"
grep -Fq 'POSTGRES_URL=' "$root/deploy/linux/.env.production.example"
grep -Fq 'npm run build --workspace @honsen/server' "$root/deploy/linux/scripts/build-release.sh"

echo 'linux release package checks passed'
