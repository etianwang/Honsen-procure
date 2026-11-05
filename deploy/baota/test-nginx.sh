#!/usr/bin/env bash
set -euo pipefail
: "${TEST_PG_CONTAINER:?Disposable PostgreSQL container required}"
: "${TEST_PG_USER:?Test database owner required}"
: "${TEST_PG_DATABASE:?Test database required}"
counts() {
 docker exec "$TEST_PG_CONTAINER" psql -At -U "$TEST_PG_USER" -d "$TEST_PG_DATABASE" -c 'SELECT (SELECT count(*) FROM sync_events), (SELECT count(*) FROM server_change_log), (SELECT count(*) FROM audit_entries);'
}
work="$(mktemp -d)"
name="honsen-v1-nginx-proof-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf -- "$work"' EXIT
cat > "$work/nginx.conf" <<'CONF'
events {}
http {
  upstream active_api { server 127.0.0.1:3000; }
  server {
    listen 18081;
    location = /v1 { return 308 /v1/; }
    location ^~ /v1/ {
      proxy_pass http://active_api/;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto https;
    }
    location / {
      default_type application/json;
      return 410 '{"code":"client_upgrade_required","message":"Please upgrade client"}';
    }
  }
}
CONF
docker run -d --rm --name "$name" --network host -v "$work/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.28 >/dev/null
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18081/v1/api/auth/captcha > "$work/health.json"; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:18081/v1/api/auth/captcha > "$work/health.json"
before="$(counts)"
test "$(curl -s -o "$work/rejected.json" -w '%{http_code}' -X POST http://127.0.0.1:18081/v2/api/sync/push)" = 410
grep -q client_upgrade_required "$work/rejected.json"
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18081/api/sync/push)" = 410
# Simulate future single activity by changing the route only, reloading same proxy.
sed -i 's@/v1@/v2@g' "$work/nginx.conf"
docker exec "$name" nginx -s reload
sleep 1
test "$(curl -s -o "$work/old.json" -w '%{http_code}' -X POST http://127.0.0.1:18081/v1/api/sync/push)" = 410
grep -q client_upgrade_required "$work/old.json"
test "$before" = "$(counts)"
printf 'Nginx active/retired path safety PASS\n'
