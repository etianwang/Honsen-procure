#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
required_node="$(tr -d '\r\n' < "$root/.nvmrc")"

for command in node npm psql pg_dump pg_restore sha256sum tar; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done

actual_node="$(node --version | sed 's/^v//')"
test "$actual_node" = "$required_node" || {
  echo "Node.js $required_node is required; found $actual_node" >&2
  exit 1
}

test -n "${POSTGRES_URL:-}" || { echo 'POSTGRES_URL is required' >&2; exit 1; }
case "$POSTGRES_URL" in
  postgresql://*|postgres://*) ;;
  *) echo 'POSTGRES_URL must be a PostgreSQL URL' >&2; exit 1 ;;
esac

echo "preflight passed (Node.js $actual_node)"
