#!/usr/bin/env bash
set -euo pipefail
repo=$(pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
NEW_ROLE=gate_new node "$repo/deploy/linux/grant-api.cjs" --check
mkdir -p "$tmp/apps/server/migrations"
cp "$repo"/apps/server/migrations/*.sql "$tmp/apps/server/migrations/"
touch "$tmp/apps/server/migrations/999_unreviewed.sql"
if (cd "$tmp" && NEW_ROLE=gate_new node "$repo/deploy/linux/grant-api.cjs" --check); then
  echo 'unreviewed migration was accepted' >&2
  exit 1
fi
echo 'migration grant policy: PASS'
