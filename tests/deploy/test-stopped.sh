#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${TEST_TMP:?}"
tmp=$(mktemp -d "$TEST_TMP/stopped.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
mkdir "$tmp/bin"
export PATH="$tmp/bin:$PATH"
cat > "$tmp/bin/systemctl" <<'SH'
#!/usr/bin/env bash
case "$*" in
  *ActiveState*) printf '%s\n' "${TEST_STATE:-inactive}" ;;
  *MainPID*) printf '%s\n' "${TEST_PID:-0}" ;;
  *) exit 2 ;;
esac
SH
cat > "$tmp/bin/pgrep" <<'SH'
#!/usr/bin/env bash
exit "${TEST_PGREP_STATUS:-1}"
SH
cat > "$tmp/bin/ss" <<'SH'
#!/usr/bin/env bash
[[ ${TEST_SS_FAIL:-0} == 0 ]] || exit 2
if [[ $* == *-tn* ]]; then printf '%s' "${TEST_CONNECTION:-}"; else printf '%s' "${TEST_LISTENER:-}"; fi
SH
chmod 755 "$tmp/bin/"*
verify() { bash deploy/linux/verify-stopped.sh; }
verify
if TEST_STATE=active verify; then exit 1; fi
if TEST_PID=99 verify; then exit 1; fi
if TEST_PGREP_STATUS=0 verify; then exit 1; fi
if TEST_PGREP_STATUS=2 verify; then exit 1; fi
if TEST_SS_FAIL=1 verify; then exit 1; fi
if TEST_LISTENER=listener verify; then exit 1; fi
if TEST_CONNECTION=connection verify; then exit 1; fi
echo 'simulated stopped-service failure cases: PASS'
