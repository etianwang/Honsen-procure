#!/usr/bin/env bash
set -euo pipefail
# ZIP digests must come from the accepted build record, never from an untrusted ZIP itself.
[[ "$#" = 5 || "$#" = 6 ]] || { echo 'Usage: build-patch.sh BASE.zip BASE_SHA256 TARGET.zip TARGET_SHA256 OUTPUT_DIR [REVIEWED_MIGRATION_APPROVAL.json]' >&2; exit 1; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
base="$(realpath -e "$1")"; base_hash="$2"
target="$(realpath -e "$3")"; target_hash="$4"
[[ "$base_hash" =~ ^[a-f0-9]{64}$ && "$target_hash" =~ ^[a-f0-9]{64}$ ]]
test "$(sha256sum "$base" | cut -d' ' -f1)" = "$base_hash"
test "$(sha256sum "$target" | cut -d' ' -f1)" = "$target_hash"
command -v node >/dev/null; command -v python3 >/dev/null; command -v unzip >/dev/null; command -v zip >/dev/null
node -e "if(process.versions.node.split('.')[0]!=='24')throw Error('Node24 required')"
mkdir -p "$5"
out="$(realpath -e "$5")"
work="$(mktemp -d)"
# Keep failed preparation evidence. No cleanup command ever targets a live application.
echo "Isolated preparation: $work"
python3 "$root/deploy/baota/archive-guard.py" "$base" "$work/base"
python3 "$root/deploy/baota/archive-guard.py" "$target" "$work/target"
approval=()
if [[ "$#" = 6 ]]; then approval=(--migration-approval "$(realpath -e "$6")"); fi
node "$root/deploy/baota/server-patch.mjs" create --base "$work/base" --target "$work/target" --output "$work/patch" "${approval[@]}"
base_sha="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).baseSha" "$work/patch/patch-manifest.json")"
target_sha="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).targetSha" "$work/patch/patch-manifest.json")"
name="honsen-procure-server-v1-patch-$base_sha-to-$target_sha.zip"
test ! -e "$out/$name"; test ! -e "$out/$name.sha256"
mkdir "$work/patch/tools"
cp "$root/deploy/baota/server-patch.mjs" "$root/deploy/baota/archive-guard.py" "$root/deploy/baota/exchange-dirs.py" "$work/patch/tools/"
cp "$root/docs/SERVER-PATCH-BAOTA.zh-CN.md" "$work/patch/README.zh-CN.md"
(cd "$work/patch"; find . -type f ! -path ./SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS; zip -qry "$out/$name" .)
python3 "$root/deploy/baota/archive-guard.py" "$out/$name"
sha256sum "$out/$name" > "$out/$name.sha256"
cp "$work/patch/DIFF.json" "$out/$name.diff.json"
echo "PATCH_CANDIDATE=$out/$name"
echo 'Before installation the actual deployment MUST match every BASE file; this build is not proof of the remote version.'
