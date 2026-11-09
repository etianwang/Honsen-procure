#!/usr/bin/env bash
set -euo pipefail
: "${TEST_WORK_DIR:?}"
work=$(mktemp -d "$TEST_WORK_DIR/ingress-test.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/bin"
export INGRESS_INCLUDE="$work/ingress.conf" INGRESS_HOST=example.test INGRESS_PORT=8080 NGINX_UNIT=nginx.service
export NGINX_BIN="$work/bin/nginx" PATH="$work/bin:$PATH"
cat > "$NGINX_BIN" <<'MOCK'
#!/usr/bin/env bash
if [[ $1 == -T ]]; then printf '# configuration file %s:\n' "$INGRESS_INCLUDE"; fi
exit 0
MOCK
cat > "$work/bin/systemctl" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat > "$work/bin/curl" <<'MOCK'
#!/usr/bin/env bash
if [[ ${FAIL_LIVE:-0} == 1 ]]; then printf 500; elif grep -q 'return 503' "$INGRESS_INCLUDE"; then printf 503; else printf 200; fi
MOCK
chmod +x "$work/bin/"*
printf '%s\n' '# honsen-procure managed ingress' 'proxy_pass http://127.0.0.1:3000;' > "$INGRESS_INCLUDE"
bash deploy/linux/switch-ingress.sh maintenance
grep -qx 'return 503;' "$INGRESS_INCLUDE"
if FAIL_LIVE=1 bash deploy/linux/switch-ingress.sh live; then echo 'failed probe was accepted' >&2; exit 1; fi
grep -qx 'return 503;' "$INGRESS_INCLUDE"
bash deploy/linux/switch-ingress.sh live
grep -qx 'proxy_pass http://127.0.0.1:3000;' "$INGRESS_INCLUDE"
printf '%s\n' 'not the dedicated include' > "$INGRESS_INCLUDE"
if bash deploy/linux/switch-ingress.sh maintenance; then echo 'unmanaged include was accepted' >&2; exit 1; fi
