#!/usr/bin/env bash
set -euo pipefail
state=$(systemctl show -p ActiveState --value honsen-procure.service)
pid=$(systemctl show -p MainPID --value honsen-procure.service)
[[ ( $state == inactive || $state == failed ) && $pid == 0 ]] || { echo 'API service has not stopped' >&2; exit 1; }
# Node can change its process name (Node 24 may appear as MainThread), so
# inspect the actual executable rather than the mutable comm or command line.
for process in /proc/[0-9]*; do
  [[ -d $process ]] || continue
  executable=$(readlink "$process/exe" 2>/dev/null) || {
    # Kernel threads and zombies have no command line; a live process that we
    # cannot inspect is not evidence that all writers have stopped.
    [[ ! -d $process ]] && continue
    [[ -r $process/cmdline ]] || { echo 'cannot inspect running process' >&2; exit 1; }
    if IFS= read -r -d '' argument < "$process/cmdline"; then
      echo 'cannot inspect running process executable' >&2; exit 1
    fi
    continue
  }
  executable=${executable% (deleted)}
  case ${executable##*/} in node|nodejs) echo 'Node process still running' >&2; exit 1 ;; esac
done
if pgrep -f '[P]M2: God Daemon' >/dev/null; then echo 'PM2 is running' >&2; exit 1; else [[ $? == 1 ]] || exit 1; fi
listeners=$(ss -H -ltn 'sport = :3000')
connections=$(ss -H -tn 'sport = :3000')
[[ -z $listeners && -z $connections ]] || { echo 'API port still listening or connected' >&2; exit 1; }
