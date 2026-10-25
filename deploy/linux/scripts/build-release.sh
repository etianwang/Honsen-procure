#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
release_dir="${RELEASE_DIR:?Set RELEASE_DIR to an empty directory outside the repository}"
release_dir="$(realpath -m "$release_dir")"
case "$release_dir" in "$root"|"$root"/*) echo 'RELEASE_DIR must be outside the repository' >&2; exit 1;; esac
test ! -e "$release_dir" || { echo "RELEASE_DIR already exists: $release_dir" >&2; exit 1; }

cd "$root"
npm ci
npm run build --workspace @honsen/server

mkdir -p "$release_dir/app/apps/server" "$release_dir/app/packages/shared"
cp package.json package-lock.json .nvmrc "$release_dir/app/"
cp -R apps/server/dist apps/server/migrations apps/server/package.json "$release_dir/app/apps/server/"
cp -R packages/shared/src packages/shared/package.json "$release_dir/app/packages/shared/"
cp deploy/linux/manual/honsen-procure.service "$release_dir/"
cp -R deploy/linux/nginx deploy/linux/postgres deploy/linux/scripts "$release_dir/"
mkdir -p "$release_dir/app/deploy/linux"
cp deploy/linux/api-grant-policy.json deploy/linux/grant-api.cjs deploy/linux/verify-api-privileges.cjs "$release_dir/app/deploy/linux/"
cp deploy/linux/.env.production.example "$release_dir/"
cp deploy/linux/README.zh-CN.md "$release_dir/"

cd "$release_dir/app"
npm ci --include=dev
node --import=tsx --input-type=module -e 'await import("./apps/server/dist/app.js")'
git -C "$root" rev-parse HEAD > "$release_dir/GIT_SHA"
cd "$release_dir"
find app/apps/server/migrations -type f -name '*.sql' -print0 | sort -z | xargs -0 sha256sum > POSTGRES_MIGRATIONS.sha256
tar -C "$release_dir" -czf "$release_dir.tar.gz" .
sha256sum "$release_dir.tar.gz" > "$release_dir.tar.gz.sha256"
echo "release package: $release_dir.tar.gz"
