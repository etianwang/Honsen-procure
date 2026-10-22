#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 ]] || exit 2
: "${TEST_TMP:?task-owned temporary directory required}"
tmp=$(mktemp -d "$TEST_TMP/systemd-test.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
mkdir "$tmp/bin"
cp deploy/linux/honsen-procure.service "$tmp/unit"
export TEST_UNIT="$tmp/unit" PATH="$tmp/bin:$PATH"
cat > "$tmp/bin/systemctl" <<'SH'
#!/usr/bin/env bash
case "$*" in
  *FragmentPath*) printf '%s\n' "$TEST_UNIT" ;;
  *DropInPaths*) printf '%s\n' "${TEST_DROPINS:-}" ;;
  *) exit 2 ;;
esac
SH
cat > "$tmp/bin/pgrep" <<'SH'
#!/usr/bin/env bash
exit "${TEST_PGREP_STATUS:-1}"
SH
chmod 755 "$tmp/bin/systemctl" "$tmp/bin/pgrep"
bash deploy/linux/verify-systemd.sh deploy/linux/honsen-procure.service
if TEST_DROPINS=/tmp/override bash deploy/linux/verify-systemd.sh deploy/linux/honsen-procure.service; then exit 1; fi
if TEST_PGREP_STATUS=0 bash deploy/linux/verify-systemd.sh deploy/linux/honsen-procure.service; then exit 1; fi
if TEST_PGREP_STATUS=2 bash deploy/linux/verify-systemd.sh deploy/linux/honsen-procure.service; then exit 1; fi
printf '\n# unexpected change\n' >> "$TEST_UNIT"
if bash deploy/linux/verify-systemd.sh deploy/linux/honsen-procure.service; then exit 1; fi
echo 'simulated systemd preflight failure cases: PASS'
