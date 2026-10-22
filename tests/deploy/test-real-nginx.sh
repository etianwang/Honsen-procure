#!/usr/bin/env bash
# Run only on an isolated CI Linux VM. This uses real nginx and systemd, not BT.
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 && $(id -u) == 0 ]] || exit 2
: "${TEST_WORK_DIR:?}"
command -v nginx >/dev/null
[[ $(ps -p 1 -o comm=) == systemd ]]
unit=honsen-test-nginx.service
unit_file="/etc/systemd/system/$unit"
[[ ! -e $unit_file ]] || { echo 'test unit already exists' >&2; exit 1; }
[[ -z $(ss -H -ltn 'sport = :3000') && -z $(ss -H -ltn 'sport = :18443') ]] || exit 1
tmp=$(mktemp -d "$TEST_WORK_DIR/real-nginx.XXXXXXXX")
chmod 755 "$tmp"
backend_pid=
cleanup() {
  status=$?
  if (( status != 0 )); then
    systemctl status "$unit" --no-pager -l >&2 || :
    journalctl -u "$unit" --no-pager -n 80 >&2 || :
  fi
  systemctl stop "$unit" >/dev/null 2>&1 || :
  rm -f -- "$unit_file"
  systemctl daemon-reload >/dev/null 2>&1 || :
  if [[ -n $backend_pid ]]; then kill "$backend_pid" 2>/dev/null || :; wait "$backend_pid" 2>/dev/null || :; fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT
mkdir -p "$tmp/www/api/auth"
printf '{"ok":true}\n' > "$tmp/www/api/auth/captcha"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=honsen.test' -addext 'subjectAltName=DNS:honsen.test' -keyout "$tmp/key.pem" -out "$tmp/cert.pem" >/dev/null 2>&1
export CURL_CA_BUNDLE="$tmp/cert.pem" NO_PROXY='honsen.test,127.0.0.1'
export INGRESS_INCLUDE="$tmp/ingress.conf" INGRESS_HOST=honsen.test INGRESS_PORT=18443 NGINX_UNIT="$unit"
printf '%s\n' '# honsen-procure managed ingress' 'return 503;' > "$INGRESS_INCLUDE"
cat > "$tmp/nginx.conf" <<EOF
pid $tmp/nginx.pid;
error_log stderr notice;
events { worker_connections 32; }
http {
  server {
    listen 127.0.0.1:18443 ssl;
    server_name honsen.test;
    ssl_certificate $tmp/cert.pem;
    ssl_certificate_key $tmp/key.pem;
    location / { include $tmp/ingress.conf; }
  }
}
EOF
export TEST_NGINX_CONFIG="$tmp/nginx.conf" NGINX_BIN="$tmp/nginx-wrapper"
cat > "$NGINX_BIN" <<'SH'
#!/usr/bin/env bash
exec /usr/sbin/nginx -c "$TEST_NGINX_CONFIG" "$@"
SH
chmod 755 "$NGINX_BIN"
cat > "$unit_file" <<EOF
[Unit]
Description=Isolated Honsen nginx integration test
[Service]
Type=simple
ExecStart=/usr/sbin/nginx -c $tmp/nginx.conf -g 'daemon off;'
ExecReload=/usr/sbin/nginx -c $tmp/nginx.conf -s reload
EOF
systemctl daemon-reload
systemctl start "$unit"
python3 -m http.server 3000 --bind 127.0.0.1 --directory "$tmp/www" > "$tmp/backend.log" 2>&1 &
backend_pid=$!
for _ in {1..50}; do
  if curl --silent --fail http://127.0.0.1:3000/api/auth/captcha >/dev/null; then break; fi
  kill -0 "$backend_pid"
  sleep .1
done
echo 'checking maintenance ingress'
bash deploy/linux/switch-ingress.sh maintenance
echo 'checking live ingress'
bash deploy/linux/switch-ingress.sh live
kill "$backend_pid"
wait "$backend_pid" || :
backend_pid=
echo 'checking dead backend failure'
if bash deploy/linux/switch-ingress.sh live; then echo 'dead backend was accepted' >&2; exit 1; fi
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' --resolve honsen.test:18443:127.0.0.1 https://honsen.test:18443/api/auth/captcha) == 503 ]]
echo 'real nginx and systemd ingress integration: PASS'
