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
created_user=0
created_restore=0
cleanup() {
  set +e
  systemctl stop honsen-procure.service honsen-controller-nginx.service >/dev/null 2>&1
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
mkdir -p "$root" /opt/honsen-procure /etc/honsen-procure /run/honsen-procure
chmod 755 "$root" /opt/honsen-procure /etc/honsen-procure
useradd --system --user-group --no-create-home honsen-procure
created_user=1
git -c safe.directory="$TEST_REPO" clone --quiet --no-hardlinks "$TEST_REPO" "$root/release"
rsync -a --exclude=.git "$TEST_REPO/" "$root/release/"
chown -R root:root "$root/release"
chmod -R go-w "$root/release"
export PATH="$TEST_NODE_DIR:/usr/sbin:/usr/bin:/sbin:/bin"
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
run_case() {
  local scenario=$1 db="gate_e2e_$1" url prior result
  echo "controller scenario: $scenario"
  systemctl stop honsen-procure.service >/dev/null 2>&1 || :
  systemctl unmask --runtime honsen-procure.service >/dev/null 2>&1 || :
  rm -f /run/honsen-procure/deployment-ready /opt/honsen-procure/current /opt/honsen-procure/.current-next "$root/fail-live"
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
SQL
  if [[ $scenario == writer ]]; then psql -X -c 'CREATE ROLE gate_unexpected LOGIN' >/dev/null; fi
  if [[ $scenario == migration ]]; then psql -X -c "UPDATE schema_migrations SET checksum = repeat('0',64) WHERE name = (SELECT min(name) FROM schema_migrations)" >/dev/null; fi
  prior=$(psql -X -Atqc "SELECT (SELECT string_agg(name || ':' || checksum, ',' ORDER BY name) FROM schema_migrations) || '|' || (SELECT sum(value)::text FROM gate_sentinel)")
  ln -s "$root/release" /opt/honsen-procure/current
  printf 'PATH=%s:/usr/bin:/bin\nPOSTGRES_URL=postgresql://gate_old:isolated-test-only@127.0.0.1:5432/%s\n' "$TEST_NODE_DIR" "$db" > /etc/honsen-procure/server.env
  chmod 600 /etc/honsen-procure/server.env
  : > /run/honsen-procure/deployment-ready
  systemctl start honsen-procure.service
  for _ in {1..100}; do curl --silent --fail http://127.0.0.1:3000/api/auth/captcha >/dev/null && break; sleep .1; done
  curl --silent --fail http://127.0.0.1:3000/api/auth/captcha >/dev/null
  printf '# honsen-procure managed ingress\nreturn 503;\n' > "$root/ingress.conf"
  systemctl reload honsen-controller-nginx.service
  password=isolated-test-only
  [[ $scenario != readiness ]] || password=incorrect-test-password
  printf 'PATH=%s:/usr/bin:/bin\nPOSTGRES_URL=postgresql://gate_new:%s@127.0.0.1:5432/%s\n' "$TEST_NODE_DIR" "$password" "$db" > /etc/honsen-procure/server.env
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
  result=0
  if [[ $scenario == success ]]; then
    bash "$root/release/deploy/linux/deploy.sh" --execute "$root/config" >"$root/$scenario.log" 2>&1 &
    first=$!
    for _ in {1..100}; do flock -n /run/honsen-procure/deploy.lock true || break; sleep .05; done
    if bash "$root/release/deploy/linux/deploy.sh" --execute "$root/config" >"$root/concurrent.log" 2>&1; then echo 'concurrent controller was accepted' >&2; exit 1; fi
    grep -q 'another deployment is running' "$root/concurrent.log"
    wait "$first" || result=$?
  else
    bash "$root/release/deploy/linux/deploy.sh" --execute "$root/config" >"$root/$scenario.log" 2>&1 || result=$?
  fi
  if [[ $scenario == success ]]; then
    [[ $result == 0 ]] || { cat "$root/$scenario.log"; exit 1; }
    bash "$root/release/deploy/linux/deploy.sh" --execute "$root/config" >"$root/repeat.log" 2>&1 || { cat "$root/repeat.log"; exit 1; }
    grep -q 'version already deployed' "$root/repeat.log"
    [[ $(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' --cacert "$root/cert.pem" --resolve honsen.test:18443:127.0.0.1 https://honsen.test:18443/api/auth/captcha) == 200 ]]
    saved_checksum=$(psql -X -Atqc 'SELECT checksum FROM schema_migrations ORDER BY name LIMIT 1')
    psql -X -c "UPDATE schema_migrations SET checksum = repeat('0',64) WHERE name = (SELECT min(name) FROM schema_migrations)" >/dev/null
    if bash "$root/release/deploy/linux/deploy.sh" --execute "$root/config" >"$root/repeat-drift.log" 2>&1; then echo 'repeat accepted migration drift' >&2; exit 1; fi
    grep -q 'recorded deployment failed verification' "$root/repeat-drift.log"
    systemctl is-active --quiet honsen-procure.service
    psql -X -v checksum="$saved_checksum" <<'SQL' >/dev/null
UPDATE schema_migrations SET checksum = :'checksum' WHERE name = (SELECT min(name) FROM schema_migrations);
SQL
  else
    [[ $result != 0 ]] || { echo 'fault was accepted' >&2; exit 1; }
    case $scenario in
      writer) expected_phase=fence ;;
      backup) expected_phase=backup ;;
      migration) expected_phase=migration ;;
      readiness) expected_phase=readiness ;;
      traffic) expected_phase=traffic ;;
    esac
    grep -q "deployment failed at $expected_phase" "$root/$scenario.log" || { cat "$root/$scenario.log"; exit 1; }
    [[ $(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' --cacert "$root/cert.pem" --resolve honsen.test:18443:127.0.0.1 https://honsen.test:18443/api/auth/captcha) == 503 ]]
    [[ $(systemctl show -p LoadState --value honsen-procure.service) == masked ]]
    [[ $(psql -X -Atqc "SELECT count(*) FROM pg_stat_activity WHERE usename IN ('gate_old','gate_new')") == 0 ]]
    if [[ $scenario != writer ]]; then
      [[ $(psql -X -Atqc "SELECT rolcanlogin FROM pg_roles WHERE rolname='gate_old'") == f ]]
    fi
  fi
  [[ $(psql -X -Atqc "SELECT (SELECT string_agg(name || ':' || checksum, ',' ORDER BY name) FROM schema_migrations) || '|' || (SELECT sum(value)::text FROM gate_sentinel)") == "$prior" ]]
  systemctl mask --runtime --now honsen-procure.service >/dev/null 2>&1 || :
  PGDATABASE=honsen_test psql -X -v ON_ERROR_STOP=1 -v db="$db" <<'SQL' >/dev/null
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'db' AND pid <> pg_backend_pid();
DROP DATABASE :"db";
DROP ROLE IF EXISTS gate_unexpected;
DROP ROLE gate_old;
DROP ROLE gate_new;
SQL
}
for case in writer backup migration readiness traffic success; do run_case "$case"; done
echo 'real isolated controller scenarios and repeat deployment: PASS'
