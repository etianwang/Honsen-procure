#!/usr/bin/env bash
set -euo pipefail
# Run in WSL Ubuntu as the existing normal development user.
root="${REPOSITORY_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
sha="$(git -c safe.directory="$root" -C "$root" rev-parse HEAD)"
out="${RELEASE_OUTPUT:-$root/.cache/server-release}"
mkdir -p "$out"
test ! -e "$out/honsen-procure-server-v1-$sha.zip"
stage="$(mktemp -d)"
trap 'docker run --rm -v "$stage:/work" node:24.22.1-bookworm chown -R "$(id -u):$(id -g)" /work >/dev/null 2>&1 || true; rm -rf -- "$stage"' EXIT
# Only committed, allowlisted server sources enter the build context.
git -c safe.directory="$root" -C "$root" archive "$sha" package.json package-lock.json apps/server packages/shared deploy/baota deploy/linux/grant-api.cjs deploy/linux/api-grant-policy.json seed | tar -x -C "$stage"
docker run --rm -v "$stage:/work" -w /work node:24.22.1-bookworm node deploy/baota/create-manifest.mjs /work "$sha"
docker run --rm -v "$stage:/work" -w /work node:24.22.1-bookworm node -e 'const fs=require("fs");for(const p of ["apps/server/src","packages/shared/src","apps/server/dist/scripts/native-test-server.js"])fs.rmSync(p,{recursive:true,force:true});function clean(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=p+"/"+e.name;if(e.isDirectory())clean(f);else if(/\.test\.js$/.test(e.name))fs.unlinkSync(f)}}clean("apps/server/dist");clean("packages/shared/dist");'
cp "$stage/deploy/baota/README.zh-CN.md" "$stage/README.zh-CN.md"
cp "$stage/deploy/baota/.env.example" "$stage/.env.example"
docker run --rm -v "$stage:/work" -w /work node:24.22.1-bookworm node deploy/baota/create-manifest.mjs /work "$sha"
(cd "$stage"; find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS; zip -qry "$out/honsen-procure-server-v1-$sha.zip" .)
sha256sum "$out/honsen-procure-server-v1-$sha.zip" > "$out/honsen-procure-server-v1-$sha.zip.sha256"
