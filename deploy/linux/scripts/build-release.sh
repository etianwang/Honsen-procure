#!/usr/bin/env bash
set -euo pipefail
umask 022
root="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
release_dir="$(realpath -m "${RELEASE_DIR:?Set RELEASE_DIR outside the repository}")"
case "$release_dir" in "$root"|"$root"/*) echo 'RELEASE_DIR must be outside the repository' >&2; exit 1;; esac
for file in "$release_dir" "$release_dir.tar.gz" "$release_dir.tar.gz.sha256" "$release_dir.manifest.json"; do
  test ! -e "$file" || { echo "output already exists: $file" >&2; exit 1; }
done
[[ -z $(git -C "$root" status --porcelain --untracked-files=no) ]] || { echo 'commit tracked changes before building' >&2; exit 1; }
sha=$(git -C "$root" rev-parse HEAD)
# A shallow, self-contained checkout retains the exact SHA required by the controller.
git init -q "$release_dir"
git -C "$release_dir" -c protocol.file.allow=always fetch --quiet --depth=1 "$root" "$sha"
git -C "$release_dir" checkout --quiet --detach FETCH_HEAD
cd "$release_dir"
export npm_config_cache="${npm_config_cache:-$HOME/.npm}"
npm ci --include=dev
npm run build --workspace @honsen/server
node --test tests/release/linux-package.test.mjs
node deploy/linux/create-artifact-manifest.cjs "$release_dir" "$release_dir.manifest.json"
# The manifest is external; it must also be supplied through an independent trusted channel.
tar -C "$release_dir" -czf "$release_dir.tar.gz" .
sha256sum "$release_dir.tar.gz" > "$release_dir.tar.gz.sha256"
echo "release commit: $sha"
echo "release package: $release_dir.tar.gz"
