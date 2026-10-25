#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 && $1 =~ ^[1-9][0-9]*$ && $2 == /* ]] || exit 2
pid=$1
release=$(realpath -e -- "$2")
[[ $(readlink -e "/proc/$pid/cwd") == "$release" ]] || { echo 'API working directory does not match release' >&2; exit 1; }
mapfile -d '' -t args < "/proc/$pid/cmdline"
[[ ${#args[@]} == 3 && ${args[1]} == --import=tsx && ${args[2]} == /opt/honsen-procure/current/apps/server/dist/index.js ]] || { echo 'API command does not match release' >&2; exit 1; }
[[ $(readlink -e /opt/honsen-procure/current) == "$release" ]] || { echo 'current release changed' >&2; exit 1; }
