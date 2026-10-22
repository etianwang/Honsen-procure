#!/usr/bin/env bash
# Destructive fixtures: run only on an explicitly disposable GitHub Linux VM.
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == disposable-ci && $(id -u) == 0 ]] || exit 2
: "${TEST_NODE_DIR:?}" "${TEST_PG_PASSWORD:?}" "${TEST_REPO:?}"
[[ $(ps -p 1 -o comm=) == systemd ]]
for item in /var/lib/honsen-controller-test /opt/honsen-procure /etc/honsen-procure /run/honsen-procure /var/lib/honsen-procure /usr/lib/systemd/system/honsen-procure.service; do
  [[ ! -e $item && ! -L $item ]] || { echo "test path exists: $item" >&2; exit 1; }
done
[[ -c /dev/fuse ]] || { echo 'CI runner has no FUSE device for isolated remote backup' >&2; exit 1; }
root=/var/lib/honsen-controller-test
unit=/etc/systemd/system/honsen-controller-nginx.service
restore=honsen-controller-e2e-restore
[[ ! -e $unit && ! -L $unit ]] || exit 1
[[ $(systemctl show -p LoadState --value honsen-procure.service) == not-found ]]
[[ $(systemctl show -p LoadState --value honsen-controller-nginx.service) == not-found ]]
if id honsen-procure >/dev/null 2>&1 || getent group honsen-procure >/dev/null; then exit 1; fi
if docker inspect "$restore" >/dev/null 2>&1; then exit 1; fi
[[ -z $(ss -H -ltn 'sport = :3000') && -z $(ss -H -ltn 'sport = :18443') ]]
sshd_pid=
rogue_pid=
privilege_injector=
created_user=0
created_restore=0
stopped_pg=
cleanup() {
  status=$?
  set +e
  [[ -z $stopped_pg ]] || docker start "$stopped_pg" >/dev/null 2>&1
  if (( status != 0 )); then
    echo "controller fixture exited with status $status" >&2
    systemctl status honsen-procure.service honsen-controller-nginx.service --no-pager -l >&2
    journalctl -u honsen-procure.service -u honsen-controller-nginx.service --no-pager -n 120 >&2
    journalctl -u 'honsen-traffic-guard-*.service' --no-pager -n 120 >&2
    for audit in "$root"/log/deploy-*.log; do [[ ! -f $audit ]] || tail -n 35 "$audit" >&2; done
    for log in "$root"/interrupt.log "$root"/interrupt_live.log "$root"/start.log "$root"/old_api.log "$root"/old_writer.log "$root"/writer.log "$root"/backup.log "$root"/migration.log "$root"/readiness.log "$root"/traffic.log "$root"/success.log "$root"/repeat.log "$root"/concurrent.log "$root"/rogue.log; do
      if [[ -f $log ]]; then printf '\n--- %s ---\n' "${log##*/}" >&2; tail -n 30 "$log" >&2; fi
    done
  fi
  systemctl stop honsen-procure.service honsen-controller-nginx.service >/dev/null 2>&1
  [[ -z $rogue_pid ]] || kill "$rogue_pid" 2>/dev/null
  [[ -z $privilege_injector ]] || kill "$privilege_injector" 2>/dev/null
  systemctl unmask --runtime honsen-procure.service >/dev/null 2>&1
  mountpoint -q "$root/remote" && fusermount3 -u "$root/remote"
  [[ -z $sshd_pid ]] || kill "$sshd_pid" 2>/dev/null
  [[ $created_restore == 0 ]] || docker rm -f "$restore" >/dev/null 2>&1
  rm -f /usr/lib/systemd/system/honsen-procure.service "$unit"
  systemctl daemon-reload >/dev/null 2>&1
  rm -rf -- "$root" /opt/honsen-procure /etc/honsen-procure /run/honsen-procure /var/lib/honsen-procure
  if [[ $created_user == 1 ]]; then
    userdel honsen-procure >/dev/null 2>&1
    groupdel honsen-procure >/dev/null 2>&1
  fi
}
trap cleanup EXIT
# GitHub's disposable runner may leave /opt writable to the runner account.
chown root:root /opt
chmod go-w /opt
mkdir -p "$root" /opt/honsen-procure /etc/honsen-procure /run/honsen-procure
chmod 755 "$root" /opt/honsen-procure /etc/honsen-procure
useradd --system --user-group --no-create-home honsen-procure
created_user=1
git -c safe.directory="$TEST_REPO" clone --quiet --no-hardlinks "$TEST_REPO" "$root/release"
rsync -a --exclude=.git "$TEST_REPO/" "$root/release/"
chown -R root:root "$root/release"
chmod -R go-w "$root/release"
export PATH="$TEST_NODE_DIR:/usr/sbin:/usr/bin:/sbin:/bin"
mkdir -p "$root/wrappers"
cat > "$root/wrappers/psql" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
root=/var/lib/honsen-controller-test
if [[ -e $root/check-release-owner && " $* " == *' token='* ]]; then
  input=$(mktemp "$root/psql-input.XXXXXXXX")
  trap 'rm -f "$input"' EXIT
  cat > "$input"
  if grep -q '^DELETE FROM honsen_deployment.controller_lock' "$input"; then
    for arg in "$@"; do [[ $arg != token=* ]] || token=${arg#token=}; done
    if systemctl is-active --quiet "honsen-traffic-guard-$token.service"; then
      echo 'unsafe release: traffic supervisor remains active' >&2
      exit 1
    fi
    if [[ -f $root/pause-release ]]; then
      printf '%s\n' "$$" > "$root/release-waiting"
      while [[ ! -f $root/release-resume ]]; do sleep .05; done
    fi
    echo 'release observed with supervisor stopped' >&2
  fi
  /usr/bin/psql "$@" < "$input"
  if grep -q '^DELETE FROM honsen_deployment.controller_lock' "$input" && [[ -f $root/pause-after-release ]]; then
    printf '%s\n' "$token" > "$root/release-token"
    printf '%s\n' "$$" > "$root/release-completed"
    while [[ ! -f $root/after-release-resume ]]; do sleep .05; done
  fi
  exit $?
fi
exec /usr/bin/psql "$@"
SH
chmod 755 "$root/wrappers/psql"
cat > "$root/wrappers/touch" <<'SH'
#!/usr/bin/env bash
root=/var/lib/honsen-controller-test
if [[ $# == 1 && $1 == */.traffic-guard.*/confirmed && -f $root/pause-confirm ]]; then
  /usr/bin/touch "$root/confirm-waiting"
  while [[ ! -f $root/confirm-resume ]]; do sleep .05; done
fi
exec /usr/bin/touch "$@"
SH
chmod 755 "$root/wrappers/touch"
export PATH="$root/wrappers:$PATH"
sha=$(git -C "$root/release" rev-parse HEAD)
manifest_digest=$(node "$root/release/deploy/linux/create-artifact-manifest.cjs" "$root/release" "$root/manifest.json")
cp "$root/release/deploy/linux/honsen-procure.service" /usr/lib/systemd/system/honsen-procure.service
mkdir -p "$root/backup" "$root/offsite" "$root/remote" "$root/log" "$root/ssh"
chmod 700 "$root/backup" "$root/offsite" "$root/remote" "$root/log" "$root/ssh"
ssh-keygen -q -t ed25519 -N '' -f "$root/ssh/client"
ssh-keygen -q -t ed25519 -N '' -f "$root/ssh/host"
cp "$root/ssh/client.pub" "$root/ssh/authorized_keys"
cat > "$root/ssh/sshd_config" <<EOF
Port 12222
ListenAddress 127.0.0.1
HostKey $root/ssh/host
PidFile $root/ssh/sshd.pid
AuthorizedKeysFile $root/ssh/authorized_keys
PermitRootLogin prohibit-password
PasswordAuthentication no
UsePAM no
StrictModes no
Subsystem sftp internal-sftp
EOF
mkdir -p /run/sshd
/usr/sbin/sshd -D -e -f "$root/ssh/sshd_config" >"$root/ssh/sshd.log" 2>&1 &
sshd_pid=$!
for _ in {1..50}; do ss -H -ltn 'sport = :12222' | grep -q . && break; sleep .1; done
sshfs -p 12222 -o IdentityFile="$root/ssh/client",StrictHostKeyChecking=no,UserKnownHostsFile=/dev/null root@127.0.0.1:"$root/offsite" "$root/remote"
docker run -d --name "$restore" -e POSTGRES_PASSWORD=isolated-test-only -p 127.0.0.1:54339:5432 postgres:16-alpine >/dev/null
created_restore=1
for _ in {1..100}; do docker exec "$restore" pg_isready -U postgres >/dev/null 2>&1 && break; sleep .2; done
cat > "$root/pg_service.conf" <<EOF
[restore]
host=127.0.0.1
port=54339
user=postgres
dbname=postgres
EOF
printf '127.0.0.1:54339:*:postgres:isolated-test-only\n' > "$root/pgpass"
chmod 600 "$root/pgpass" "$root/pg_service.conf"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=honsen.test' -addext 'subjectAltName=DNS:honsen.test' -keyout "$root/key.pem" -out "$root/cert.pem" >/dev/null 2>&1
cat > "$root/nginx.conf" <<EOF
pid $root/nginx.pid;
error_log $root/nginx-error.log notice;
events { worker_connections 32; }
http { server {
  listen 127.0.0.1:18443 ssl;
  server_name honsen.test;
  ssl_certificate $root/cert.pem;
  ssl_certificate_key $root/key.pem;
  location / { include $root/ingress.conf; }
} }
EOF
cat > "$root/nginx-wrapper" <<'SH'
#!/usr/bin/env bash
if [[ ${1:-} == -t && -f /var/lib/honsen-controller-test/pause-live ]] && grep -q '^proxy_pass ' /var/lib/honsen-controller-test/ingress.conf; then
  : > /var/lib/honsen-controller-test/live-waiting
  while [[ ! -f /var/lib/honsen-controller-test/live-resume ]]; do sleep .05; done
fi
if [[ ${1:-} == -t && -f /var/lib/honsen-controller-test/fail-live ]] && grep -q '^proxy_pass ' /var/lib/honsen-controller-test/ingress.conf; then exit 1; fi
exec /usr/sbin/nginx -c /var/lib/honsen-controller-test/nginx.conf "$@"
SH
chmod 755 "$root/nginx-wrapper"
cat > "$unit" <<EOF
[Unit]
Description=Disposable controller test nginx
[Service]
Type=simple
ExecStart=/usr/sbin/nginx -c $root/nginx.conf -g 'daemon off;'
ExecReload=/usr/sbin/nginx -c $root/nginx.conf -s reload
EOF
printf '# honsen-procure managed ingress\nreturn 503;\n' > "$root/ingress.conf"
systemctl daemon-reload
systemctl start honsen-controller-nginx.service
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=honsen_test PGPASSWORD="$TEST_PG_PASSWORD" PGDATABASE=honsen_test
base_url="postgresql://honsen_test:$TEST_PG_PASSWORD@127.0.0.1:5432"
printf '127.0.0.1:5432:*:honsen_test:%s\n' "$TEST_PG_PASSWORD" >> "$root/pgpass"
wait_guard_finished() {
  local token state
  token=$(psql -X -Atqc 'SELECT token FROM honsen_deployment.controller_lock')
  [[ -n $token ]] || return 0
  for _ in {1..1200}; do
    state=$(systemctl show -p ActiveState --value "honsen-traffic-guard-$token.service")
    [[ $state == inactive || $state == failed ]] && return 0
    [[ $state == active && $(systemctl show -p SubState --value "honsen-traffic-guard-$token.service") == exited ]] && return 0
    sleep .1
  done
  echo 'traffic supervisor failed to finish recovery' >&2
  return 1
}
run_case() {
  local scenario=$1 db="gate_e2e_$1" url prior result
  echo "controller scenario: $scenario"
  systemctl stop honsen-procure.service >/dev/null 2>&1 || :
  systemctl unmask --runtime honsen-procure.service >/dev/null 2>&1 || :
  rm -f /run/honsen-procure/deployment-ready /opt/honsen-procure/current /opt/honsen-procure/.current-next "$root/fail-live" "$root/pause-live" "$root/live-waiting" "$root/live-resume" "$root/pause-confirm" "$root/confirm-waiting" "$root/confirm-resume" "$root/check-release-owner" "$root/pause-release" "$root/release-waiting" "$root/release-resume" "$root/pause-after-release" "$root/release-completed" "$root/release-token" "$root/after-release-resume"
  rm -rf /var/lib/honsen-procure
  PGDATABASE=honsen_test psql -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db" >/dev/null
  export PGDATABASE=$db
  url="$base_url/$db"
  (cd "$root/release" && POSTGRES_URL="$url" npm run migrate --workspace @honsen/server >/dev/null)
  psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE ROLE gate_old LOGIN PASSWORD 'isolated-test-only';
CREATE ROLE gate_new NOLOGIN PASSWORD 'isolated-test-only';
SQL
  # CREATE DATABASE's name is dynamic; use psql's identifier quoting.
  psql -X -v ON_ERROR_STOP=1 -v db="$db" <<'SQL' >/dev/null
GRANT CONNECT ON DATABASE :"db" TO gate_old, gate_new;
GRANT USAGE ON SCHEMA public TO gate_old, gate_new;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gate_old, gate_new;
CREATE TABLE gate_sentinel (value integer NOT NULL);
INSERT INTO gate_sentinel VALUES (7);
GRANT INSERT ON gate_sentinel TO gate_old;
SQL
  if [[ $scenario == writer ]]; then psql -X -c 'CREATE ROLE gate_unexpected LOGIN' >/dev/null; fi
  if [[ $scenario == old_writer ]]; then
    psql -X -v ON_ERROR_STOP=1 -c 'CREATE ROLE gate_parent NOLOGIN; GRANT gate_parent TO gate_old' >/dev/null
    PGUSER=gate_old PGPASSWORD=isolated-test-only psql -X -v ON_ERROR_STOP=1 -c 'BEGIN; INSERT INTO gate_sentinel VALUES (1); ROLLBACK' >/dev/null
  fi
  if [[ $scenario == migration ]]; then psql -X -c "UPDATE schema_migrations SET checksum = repeat('0',64) WHERE name = (SELECT min(name) FROM schema_migrations)" >/dev/null; fi
  # Exercise a real pending production migration, not only the no-op path.
  psql -X -v ON_ERROR_STOP=1 -c "DROP TABLE qa_sequence_items; DELETE FROM schema_migrations WHERE name = '007_qa_sequence.sql'" >/dev/null
  echo "pending migration: 007_qa_sequence.sql (table and owned sequence absent)"
  prior=$(psql -X -Atqc "SELECT (SELECT string_agg(name || ':' || checksum, ',' ORDER BY name) FROM schema_migrations) || '|' || (SELECT sum(value)::text FROM gate_sentinel)")
  ln -s "$root/release" /opt/honsen-procure/current
  printf 'PATH=%s:/usr/bin:/bin\nPOSTGRES_URL=postgresql://gate_old:isolated-test-only@127.0.0.1:5432/%s\n' "$TEST_NODE_DIR" "$db" > /etc/honsen-procure/server.env
  chmod 600 /etc/honsen-procure/server.env
  : > /run/honsen-procure/deployment-ready
  systemctl start honsen-procure.service
  for _ in {1..100}; do curl --silent --fail http://127.0.0.1:3000/api/auth/captcha >/dev/null && break; sleep .1; done
  curl --silent --fail http://127.0.0.1:3000/api/auth/captcha >/dev/null
  if [[ $scenario == old_api ]]; then
    (cd "$root/release" && exec env PG_TEST_URL="postgresql://gate_old:isolated-test-only@127.0.0.1:5432/$db?application_name=gate_rogue" node -e 'const {Client}=require("pg"); const c=new Client({connectionString:process.env.PG_TEST_URL}); c.connect().then(()=>setInterval(()=>{},1000)).catch(e=>{console.error(e);process.exit(1)})') >"$root/rogue.log" 2>&1 &
    rogue_pid=$!
    for _ in {1..100}; do
      [[ $(psql -X -Atqc "SELECT count(*) FROM pg_stat_activity WHERE usename='gate_old' AND application_name='gate_rogue'") == 1 ]] && break
      kill -0 "$rogue_pid"
      sleep .1
    done
    [[ $(psql -X -Atqc "SELECT count(*) FROM pg_stat_activity WHERE usename='gate_old' AND application_name='gate_rogue'") == 1 ]]
  fi
  printf '# honsen-procure managed ingress\nreturn 503;\n' > "$root/ingress.conf"
  systemctl reload honsen-controller-nginx.service
  password=isolated-test-only
  [[ $scenario != readiness ]] || password=incorrect-test-password
  api_path="$TEST_NODE_DIR:/usr/bin:/bin"
  [[ $scenario != start ]] || api_path=/nonexistent
  printf 'PATH=%s\nPOSTGRES_URL=postgresql://gate_new:%s@127.0.0.1:5432/%s\n' "$api_path" "$password" "$db" > /etc/honsen-procure/server.env
  chmod 600 /etc/honsen-procure/server.env
  cat > "$root/inventory.json" <<EOF
{"schema":1,"host":"$(hostname -f)","apiManager":"systemd:honsen-procure.service","ingress":"bt-nginx-only","oldRole":"gate_old","newRole":"gate_new","administrationFrozen":true,"otherWritersReviewed":true,"otherWriters":[]}
EOF
  chmod 600 "$root/inventory.json"
  restore_service=restore
  [[ $scenario != backup ]] || restore_service=missing_test_service
  cat > "$root/config" <<EOF
DEPLOY_AUTHORIZED=yes
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=honsen_test PGDATABASE=$db PGPASSWORD=$TEST_PG_PASSWORD
export PATH=$root/wrappers:$TEST_NODE_DIR:/usr/sbin:/usr/bin:/sbin:/bin
POSTGRES_URL=$url
OLD_ROLE=gate_old
NEW_ROLE=gate_new
RELEASE_DIR=$root/release
RELEASE_SHA=$sha
RELEASE_MANIFEST=$root/manifest.json
RELEASE_MANIFEST_SHA256=$manifest_digest
WRITER_INVENTORY=$root/inventory.json
BACKUP_DIR=$root/backup
EXTERNAL_BACKUP_DIR=$root/remote
AUDIT_DIR=$root/log
RESTORE_SERVICE=$restore_service
PGSERVICEFILE=$root/pg_service.conf
PGPASSFILE=$root/pgpass
BACKUP_RETENTION_DAYS=30
BACKUP_RETENTION_POLICY=retain-all
OFFSITE_STORAGE_ATTESTED=yes
NGINX_BIN=$root/nginx-wrapper
NGINX_UNIT=honsen-controller-nginx.service
INGRESS_INCLUDE=$root/ingress.conf
INGRESS_HOST=honsen.test
INGRESS_PORT=18443
export CURL_CA_BUNDLE=$root/cert.pem NO_PROXY=honsen.test,127.0.0.1
EOF
  chmod 600 "$root/config"
  [[ $scenario != traffic ]] || touch "$root/fail-live"
  if [[ $scenario == privileges ]]; then
    existing_logs=$(find "$root/log" -maxdepth 1 -type f -name 'deploy-*.log' -printf '|%f|')
    (
      for _ in {1..3000}; do
        for audit in "$root"/log/deploy-*.log; do
          [[ -f $audit && $existing_logs != *"|${audit##*/}|"* ]] || continue
          if grep -q 'step=new_role_activated' "$audit"; then
            psql -X -v ON_ERROR_STOP=1 -c 'REVOKE USAGE ON SEQUENCE qa_sequence_items_id_seq FROM gate_new' >/dev/null
            exit 0
          fi
        done
        sleep .01
      done
      exit 1
    ) &
    privilege_injector=$!
  fi
  result=0
  bash "$root/release/deploy/linux/deploy.sh" --execute "$root/config" >"$root/$scenario.log" 2>&1 || result=$?
  if [[ $scenario == privileges ]]; then wait "$privilege_injector"; privilege_injector=; fi
  audit_file=$(sed -n 's/.*; audit: //p' "$root/$scenario.log" | tail -n 1)
  [[ -f $audit_file ]] || { cat "$root/$scenario.log"; exit 1; }
  cat "$audit_file"
  grep -Fq 'step=migration_verified' "$audit_file"
  grep -Fq 'grant_object=qa_sequence_items owner=honsen_test privileges=SELECT,INSERT' "$audit_file"
  grep -Fq 'grant_object=qa_sequence_items_id_seq owner=honsen_test privileges=USAGE' "$audit_file"
  [[ $(psql -X -Atqc "SELECT count(*) FROM schema_migrations WHERE name='007_qa_sequence.sql'") == 1 ]]
  if [[ $scenario == privileges ]]; then
    [[ $result != 0 ]]
    grep -Fq 'step=failed:readiness' "$audit_file"
    [[ $(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' --cacert "$root/cert.pem" --resolve honsen.test:18443:127.0.0.1 https://honsen.test:18443/api/auth/captcha) == 503 ]]
    [[ $(systemctl show -p LoadState --value honsen-procure.service) == masked ]]
    echo 'revoked sequence USAGE rejected at readiness, HTTPS 503: PASS'
    [[ $(psql -X -Atqc "SELECT rolcanlogin FROM pg_roles WHERE rolname='gate_new'") == f ]]
    token=$(psql -X -Atqc 'SELECT token FROM honsen_deployment.controller_lock')
    [[ -n $token ]]
    # Disposable fixture operator recovery after confirming masked API and maintenance.
    (source "$root/config"; bash "$root/release/deploy/linux/deployment-lock.sh" release "$token")
    systemctl unmask --runtime honsen-procure.service
    bash "$root/release/deploy/linux/deploy.sh" --execute "$root/config" >"$root/recovery.log" 2>&1 || { cat "$root/recovery.log"; exit 1; }
    recovery_audit=$(sed -n 's/.*; audit: //p' "$root/recovery.log" | tail -n 1)
    grep -Fq 'grant_object=qa_sequence_items_id_seq owner=honsen_test privileges=USAGE' "$recovery_audit"
    grep -Fq 'step=success' "$recovery_audit"
    [[ $(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' --cacert "$root/cert.pem" --resolve honsen.test:18443:127.0.0.1 https://honsen.test:18443/api/auth/captcha) == 200 ]]
    PGUSER=gate_new PGPASSWORD=isolated-test-only psql -X -v ON_ERROR_STOP=1 -c "BEGIN; INSERT INTO qa_sequence_items (note) VALUES ('recovered'); ROLLBACK" >/dev/null
    echo 'same database: production controller restored USAGE and published: PASS'
  else
    [[ $result == 0 ]] || { cat "$root/$scenario.log"; exit 1; }
    grep -Fq 'step=success' "$audit_file"
    [[ $(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' --cacert "$root/cert.pem" --resolve honsen.test:18443:127.0.0.1 https://honsen.test:18443/api/auth/captcha) == 200 ]]
    PGUSER=gate_new PGPASSWORD=isolated-test-only psql -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT current_user, has_sequence_privilege(current_user, 'public.qa_sequence_items_id_seq', 'USAGE') AS usage, has_sequence_privilege(current_user, 'public.qa_sequence_items_id_seq', 'SELECT') AS select, has_sequence_privilege(current_user, 'public.qa_sequence_items_id_seq', 'UPDATE') AS update;
BEGIN;
INSERT INTO qa_sequence_items (note) VALUES ('default insert');
INSERT INTO qa_sequence_items (id, note) VALUES (nextval('qa_sequence_items_id_seq'), 'explicit nextval');
SELECT count(*) FROM qa_sequence_items;
ROLLBACK;
SQL
    [[ $(PGUSER=gate_new PGPASSWORD=isolated-test-only psql -X -Atqc "SELECT has_sequence_privilege(current_user,'public.qa_sequence_items_id_seq','USAGE') AND NOT has_sequence_privilege(current_user,'public.qa_sequence_items_id_seq','SELECT') AND NOT has_sequence_privilege(current_user,'public.qa_sequence_items_id_seq','UPDATE')") == t ]]
    echo 'fresh sequence: DEFAULT INSERT and nextval succeed with USAGE only: PASS'
  fi
  systemctl mask --runtime --now honsen-procure.service >/dev/null 2>&1 || :
  PGDATABASE=honsen_test psql -X -v ON_ERROR_STOP=1 -v db="$db" <<'SQL' >/dev/null
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'db' AND pid <> pg_backend_pid();
DROP DATABASE :"db";
DROP ROLE gate_old;
DROP ROLE gate_new;
SQL
}
for case in privileges success; do run_case "$case"; done
echo 'new migration sequence focused checks: PASS'
