#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${PGDATABASE:?}" "${POSTGRES_URL:?}" "${BAD_POSTGRES_URL:?}"
bash deploy/linux/verify-database.sh
if POSTGRES_URL="$BAD_POSTGRES_URL" bash deploy/linux/verify-database.sh; then
  echo 'different database was accepted' >&2
  exit 1
fi
echo 'deployment and migration database identity: PASS'
