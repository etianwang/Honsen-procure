#!/usr/bin/env bash
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 && $(id -u) == 0 ]] || exit 2
: "${TEST_TMP:?task-owned temporary directory required}"
tmp=$(mktemp -d "$TEST_TMP/completed.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
mkdir "$tmp/bin" "$tmp/release"
ln -s "$tmp/release" "$tmp/current"
export RELEASE_SHA=1111111111111111111111111111111111111111 RELEASE_DIR="$tmp/release"
export OLD_ROLE=old NEW_ROLE=new INGRESS_INCLUDE="$tmp/ingress" INGRESS_HOST=example.invalid INGRESS_PORT=443
export PATH="$tmp/bin:$PATH"
printf '# honsen-procure managed ingress\nproxy_pass http://127.0.0.1:3000;\n' > "$INGRESS_INCLUDE"
cat > "$tmp/bin/systemctl" <<'SH'
#!/usr/bin/env bash
if [[ ${1:-} == show ]]; then printf '42\n'; fi
exit "${TEST_SERVICE_STATUS:-0}"
SH
cat > "$tmp/bin/curl" <<'SH'
#!/usr/bin/env bash
printf '%s' "${TEST_HTTP_STATUS:-200}"
SH
cat > "$tmp/bin/psql" <<'SH'
#!/usr/bin/env bash
cat >/dev/null
printf '%s\n' "${TEST_ROLE_STATUS:-1}"
SH
cat > "$tmp/bin/node" <<'SH'
#!/usr/bin/env bash
cat >/dev/null
printf 'new|1'
SH
chmod 755 "$tmp/bin/"*
verify() { bash deploy/linux/verify-completed.sh "$tmp/marker" "$tmp/current"; }
if verify; then exit 1; else [[ $? == 3 ]]; fi
printf '%s\n' "$RELEASE_SHA" > "$tmp/marker"
chmod 600 "$tmp/marker"
verify
if TEST_ROLE_STATUS=0 verify; then echo 'unsafe roles accepted' >&2; exit 1; fi
if TEST_HTTP_STATUS=503 verify; then echo 'unready ingress accepted' >&2; exit 1; fi
if TEST_SERVICE_STATUS=1 verify; then echo 'stopped service accepted' >&2; exit 1; fi
printf '%040d\n' 2 > "$tmp/marker"
if verify; then exit 1; else [[ $? == 3 ]]; fi
echo 'simulated completed-deployment checks: PASS'
