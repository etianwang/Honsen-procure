#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 && -f $1 ]] || exit 2
fragment=$(systemctl show honsen-procure.service -p FragmentPath --value)
dropins=$(systemctl show honsen-procure.service -p DropInPaths --value)
[[ -n $fragment && -f $fragment && -z $dropins ]] || { echo 'unknown systemd unit or override' >&2; exit 1; }
cmp -s -- "$1" "$fragment" || { echo 'installed systemd unit differs from approved template' >&2; exit 1; }
if pgrep -f '[P]M2: God Daemon' >/dev/null; then
  echo 'PM2 is running; API manager exclusivity is unknown' >&2
  exit 1
else
  status=$?
  [[ $status == 1 ]] || { echo 'cannot inspect PM2 processes' >&2; exit 1; }
fi
