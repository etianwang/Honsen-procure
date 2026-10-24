#!/usr/bin/env bash
# Run only on a disposable CI VM. The API process is a test fixture.
set -euo pipefail
[[ ${HONSEN_DEPLOY_TEST:-} == 1 && $(id -u) == 0 ]] || exit 2
: "${TEST_NODE_DIR:?}"
[[ $(ps -p 1 -o comm=) == systemd ]]
unit=/usr/lib/systemd/system/honsen-procure.service
for path in "$unit" /www/Honsen-procure /etc/honsen-procure /run/honsen-procure; do [[ ! -e $path && ! -L $path ]] || exit 1; done
if id honsen-procure >/dev/null 2>&1; then exit 1; fi
if getent group honsen-procure >/dev/null; then exit 1; fi
[[ -z $(ss -H -ltn 'sport = :3000') ]] || exit 1
created_user=0
cleanup() {
  systemctl stop honsen-procure.service >/dev/null 2>&1 || :
  systemctl unmask --runtime honsen-procure.service >/dev/null 2>&1 || :
  rm -f -- "$unit"
  systemctl daemon-reload >/dev/null 2>&1 || :
  rm -rf -- /www/Honsen-procure /etc/honsen-procure /run/honsen-procure
  if [[ $created_user == 1 ]]; then userdel honsen-procure || :; groupdel honsen-procure 2>/dev/null || :; fi
}
trap cleanup EXIT
useradd --system --user-group --no-create-home honsen-procure
created_user=1
mkdir -p /www/Honsen-procure/release/apps/server/dist /etc/honsen-procure /run/honsen-procure
mkdir -p /www/Honsen-procure/release/node_modules
cp -a node_modules/tsx node_modules/esbuild node_modules/@esbuild /www/Honsen-procure/release/node_modules/
ln -s /www/Honsen-procure/release /www/Honsen-procure/current
cp deploy/linux/honsen-procure.service "$unit"
printf 'PATH=%s:/usr/bin:/bin\n' "$TEST_NODE_DIR" > /etc/honsen-procure/server.env
cat > /www/Honsen-procure/current/apps/server/dist/index.js <<'JS'
require('node:http').createServer((req, res) => res.end('ready')).listen(3000, '127.0.0.1')
JS
: > /run/honsen-procure/deployment-ready
systemctl daemon-reload
bash deploy/linux/verify-systemd.sh deploy/linux/honsen-procure.service
systemctl start honsen-procure.service
for _ in {1..50}; do
  if curl --silent --fail http://127.0.0.1:3000/ >/dev/null; then break; fi
  sleep .1
done
curl --silent --fail http://127.0.0.1:3000/ >/dev/null
api_pid=$(systemctl show -p MainPID --value honsen-procure.service)
bash deploy/linux/verify-running-release.sh "$api_pid" /www/Honsen-procure/release
if bash deploy/linux/verify-running-release.sh "$api_pid" /www/Honsen-procure; then echo 'incorrect release was accepted' >&2; exit 1; fi
if bash deploy/linux/verify-stopped.sh; then echo 'running API was accepted as stopped' >&2; exit 1; fi
systemctl mask --runtime --now honsen-procure.service
[[ $(systemctl show -p LoadState --value honsen-procure.service) == masked ]]
for _ in {1..50}; do
  if bash deploy/linux/verify-stopped.sh >/dev/null 2>&1; then break; fi
  sleep .1
done
bash deploy/linux/verify-stopped.sh
if systemctl start honsen-procure.service; then echo 'masked API restarted' >&2; exit 1; fi
echo 'real systemd API stop and mask: PASS'
