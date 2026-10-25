#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${PGDATABASE:?a disposable database is required}"
first=11111111-1111-4111-8111-111111111111
second=22222222-2222-4222-8222-222222222222
lock=deploy/linux/deployment-lock.sh
# The fixture database must be dedicated to this test; never clear a live lock.
[[ $(psql -X -Atqc "SELECT to_regclass('honsen_deployment.controller_lock') IS NULL") == t ]]
cleanup() { psql -X -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS honsen_deployment CASCADE' >/dev/null; }
trap cleanup EXIT
bash "$lock" acquire "$first"
if bash "$lock" acquire "$second"; then echo 'second deployment acquired lock' >&2; exit 1; fi
if bash "$lock" release "$second"; then echo 'non-owner released lock' >&2; exit 1; fi
# A completed client process does not release the persistent lock.
if bash "$lock" acquire "$second"; then echo 'lock disappeared after client exit' >&2; exit 1; fi
bash "$lock" release "$first"
bash "$lock" acquire "$second"
bash "$lock" release "$second"
bash "$lock" acquire "$first" >/dev/null 2>&1 &
pid1=$!
bash "$lock" acquire "$second" >/dev/null 2>&1 &
pid2=$!
ok1=0; ok2=0
wait "$pid1" && ok1=1 || :
wait "$pid2" && ok2=1 || :
[[ $((ok1 + ok2)) == 1 ]] || { echo 'simultaneous acquisition did not select exactly one owner' >&2; exit 1; }
if [[ $ok1 == 1 ]]; then bash "$lock" release "$first"; else bash "$lock" release "$second"; fi
echo 'deployment lock exclusion and crash persistence: PASS'
