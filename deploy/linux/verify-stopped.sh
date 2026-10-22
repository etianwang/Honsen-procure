#!/usr/bin/env bash
set -euo pipefail
state=$(systemctl show -p ActiveState --value honsen-procure.service)
pid=$(systemctl show -p MainPID --value honsen-procure.service)
[[ ( $state == inactive || $state == failed ) && $pid == 0 ]] || { echo 'API service has not stopped' >&2; exit 1; }
if pgrep -x node >/dev/null; then echo 'Node process still running' >&2; exit 1; else [[ $? == 1 ]] || exit 1; fi
if pgrep -f '[P]M2: God Daemon' >/dev/null; then echo 'PM2 is running' >&2; exit 1; else [[ $? == 1 ]] || exit 1; fi
listeners=$(ss -H -ltn 'sport = :3000')
connections=$(ss -H -tn 'sport = :3000')
[[ -z $listeners && -z $connections ]] || { echo 'API port still listening or connected' >&2; exit 1; }
