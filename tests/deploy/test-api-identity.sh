#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${POSTGRES_URL:?}" "${PGUSER:?}"
node -e 'setInterval(() => {}, 1000)' &
pid=$!
cleanup() { kill "$pid" 2>/dev/null || :; wait "$pid" 2>/dev/null || :; }
trap cleanup EXIT
bash deploy/linux/verify-api-identity.sh "$pid" "$PGUSER"
if bash deploy/linux/verify-api-identity.sh "$pid" definitely_not_the_user; then
  echo 'incorrect API role was accepted' >&2; exit 1
fi
echo 'API process database identity: PASS'
