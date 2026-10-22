#!/usr/bin/env bash
# The BT-managed location must include this dedicated file exactly once.
set -euo pipefail
umask 077
: "${NGINX_BIN:?}" "${NGINX_UNIT:?}" "${INGRESS_INCLUDE:?}" "${INGRESS_HOST:?}" "${INGRESS_PORT:?}"
[[ $# == 1 && ( $1 == maintenance || $1 == live ) ]] || exit 2
[[ $INGRESS_INCLUDE == /* && -f $INGRESS_INCLUDE && ! -L $INGRESS_INCLUDE ]] || exit 2
[[ $(head -n 1 "$INGRESS_INCLUDE") == '# honsen-procure managed ingress' ]] || { echo 'include is not a dedicated Honsen ingress file' >&2; exit 1; }
[[ $INGRESS_HOST =~ ^[A-Za-z0-9.-]+$ && $INGRESS_PORT =~ ^[0-9]{1,5}$ ]] || exit 2
[[ $NGINX_UNIT =~ ^[A-Za-z0-9_.@-]+\.service$ ]] || exit 2
config=$("$NGINX_BIN" -T 2>/dev/null)
[[ $(printf '%s\n' "$config" | grep -Fxc "# configuration file $INGRESS_INCLUDE:") == 1 ]] || { echo 'ingress include missing or duplicated' >&2; exit 1; }
dir=${INGRESS_INCLUDE%/*}
tmp=$(mktemp "$dir/.honsen-ingress.XXXXXXXX")
old=$(mktemp "$dir/.honsen-ingress-old.XXXXXXXX")
cp -- "$INGRESS_INCLUDE" "$old"
chmod --reference="$INGRESS_INCLUDE" "$old"
chown --reference="$INGRESS_INCLUDE" "$old"
cleanup() { rm -f -- "$tmp" "$old"; }
trap cleanup EXIT
if [[ $1 == maintenance ]]; then
  printf '%s\n' '# honsen-procure managed ingress' 'return 503;' > "$tmp"
  expected=503
else
  printf '%s\n' '# honsen-procure managed ingress' 'proxy_pass http://127.0.0.1:3000;' > "$tmp"
  expected=200
fi
chmod --reference="$INGRESS_INCLUDE" "$tmp"
chown --reference="$INGRESS_INCLUDE" "$tmp"
mv -f -- "$tmp" "$INGRESS_INCLUDE"
if ! "$NGINX_BIN" -t >/dev/null 2>&1 || ! systemctl reload "$NGINX_UNIT"; then
  mv -f -- "$old" "$INGRESS_INCLUDE"
  if ! "$NGINX_BIN" -t >/dev/null 2>&1 || ! systemctl reload "$NGINX_UNIT"; then systemctl stop "$NGINX_UNIT" || true; fi
  echo 'ingress switch failed' >&2
  exit 1
fi
status=$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' -H "Host: $INGRESS_HOST" "http://127.0.0.1:$INGRESS_PORT/api/auth/captcha") || status=000
if [[ $status != "$expected" ]]; then
  # A failed live switch must not leave a live include on disk or in memory.
  if [[ $1 == live ]]; then
    printf '%s\n' '# honsen-procure managed ingress' 'return 503;' > "$old"
    mv -f -- "$old" "$INGRESS_INCLUDE"
    if ! "$NGINX_BIN" -t >/dev/null 2>&1 || ! systemctl reload "$NGINX_UNIT"; then systemctl stop "$NGINX_UNIT" || true; fi
  fi
  echo 'ingress probe failed' >&2
  exit 1
fi
