#!/usr/bin/env bash
set -euo pipefail
: "${TEST_LOCAL_DIR:?}" "${TEST_EXTERNAL_DIR:?}"
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
archive=$(bash deploy/linux/backup.sh "$TEST_LOCAL_DIR")
copy=$(bash deploy/linux/verify-external-backup.sh "$archive" "$TEST_EXTERNAL_DIR")
cmp -s -- "$archive" "$copy"
if bash deploy/linux/verify-external-backup.sh "$archive" "$TEST_LOCAL_DIR" >/dev/null 2>&1; then
  echo 'same-filesystem backup was accepted' >&2; exit 1
fi
