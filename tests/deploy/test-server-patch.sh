#!/usr/bin/env bash
# Run under the existing normal WSL development user, never against staging.
# Arguments: clean extracted BASE directory, clean extracted TARGET directory,
# new evidence/work directory. Extraction must preserve archive modes/symlinks.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
test "$#" -eq 3 || { echo 'usage: test-server-patch.sh BASE TARGET NEW_WORK'; exit 2; }
base=$(realpath "$1")
target=$(realpath "$2")
work=$(realpath -m "$3")
test ! -e "$work" || { echo 'WORK_MUST_NOT_EXIST'; exit 2; }
test -f "$root/.env.test"
docker version >/dev/null
docker compose version >/dev/null
docker buildx version >/dev/null
image=${HONSEN_UBUNTU_PROOF_IMAGE:-honsen-v1-ubuntu24-node24-proof:latest}
docker image inspect "$image" >/dev/null
project="honsen-patch-$(date +%s)-$$"
compose=(docker compose --project-name "$project" --env-file "$root/.env.test" -f "$root/compose.test.yaml")
cleanup() { "${compose[@]}" down --volumes >/dev/null 2>&1; }
trap cleanup EXIT
"${compose[@]}" up --detach --wait postgres-test >/dev/null
mkdir -p "$work"
native_work=$(mktemp -d /tmp/honsen-patch-runtime.XXXXXXXX)
cleanup() {
  "${compose[@]}" down --volumes >/dev/null 2>&1
  case "$native_work" in /tmp/honsen-patch-runtime.*) rm -rf -- "$native_work" ;; esac
}
# Neutral runner cwd ensures the real Linux /proc stopped check sees only the API.
docker run --rm --network "${project}_default" \
  --env-file "$root/.env.test" -e HONSEN_PATCH_ISOLATED_TEST=1 \
  -v "$root:/repo:ro" -v "$base:/base:ro" -v "$target:/target:ro" \
  -v "$native_work:/runtime" -w /repo "$image" \
  node tests/deploy/test-server-patch.mjs /base /target /runtime/run \
  2>&1 | tee "$work/runtime.log"
