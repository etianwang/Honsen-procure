#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 && $(id -u) == 0 ]] || exit 2
: "${TEST_TMP:?}"
tmp=$(mktemp -d "$TEST_TMP/authorization.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
config="$tmp/config"
printf 'DEPLOY_AUTHORIZED=no\n' > "$config"
chmod 600 "$config"
if bash deploy/linux/deploy.sh --execute "$config" >"$tmp/out" 2>&1; then
  echo 'unauthorized deployment accepted' >&2; exit 1
fi
grep -q 'deployment authorization required' "$tmp/out"
printf 'DEPLOY_AUTHORIZED=yes\n' > "$config"
if bash deploy/linux/deploy.sh "$config" >"$tmp/out" 2>&1; then
  echo 'deployment without explicit execute switch accepted' >&2; exit 1
fi
grep -q 'explicit --execute and protected configuration required' "$tmp/out"
if bash deploy/linux/deploy.sh --execute "$config" >"$tmp/out" 2>&1; then
  echo 'incomplete configuration accepted' >&2; exit 1
fi
grep -q 'POSTGRES_URL' "$tmp/out"
echo 'explicit controller authorization and configuration gates: PASS'
