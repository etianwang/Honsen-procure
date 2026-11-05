#!/usr/bin/env bash
set -euo pipefail
# Run in WSL Ubuntu as the existing normal development user.
root="$(cd "$(dirname "$0")/../.." && pwd)"
sha="$(git -C "$root" rev-parse HEAD)"
out="${RELEASE_OUTPUT:-$root/.cache/server-release}"
mkdir -p "$out"
test ! -e "$out/honsen-procure-server-v1-$sha.zip"
stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT
# Only committed, allowlisted server sources enter the build context.
git -C "$root" archive "$sha" package.json package-lock.json apps/server packages/shared deploy/baota deploy/linux/grant-api.cjs deploy/linux/api-grant-policy.json seed | tar -x -C "$stage"
docker run --rm -v "$stage:/work" -w /work node:24.22.1-bookworm bash -euc 'npm ci --include=dev; npm run build --workspace @honsen/shared; npm run build --workspace @honsen/server; npm prune --omit=dev; node -e '\''const fs=require("fs");const p="packages/shared/package.json";const j=JSON.parse(fs.readFileSync(p));j.exports={".":"./dist/index.js"};fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")'\'''
cp "$stage/deploy/baota/README.zh-CN.md" "$stage/README.zh-CN.md"
cp "$stage/deploy/baota/.env.example" "$stage/.env.example"
docker run --rm -v "$stage:/work" -w /work node:24.22.1-bookworm node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({schemaVersion:1,sourceSha:process.argv[2],apiVersion:"v1",apiBaseUrl:"https://api-pr.honsen.africa/v1",deploymentDirectory:"/www/wwwroot/api-pr/v1/",node:"24.22.1",platform:"linux-x64",acceptance:"NOT_YET_VERIFIED"},null,2)+"\n")' /work/build-manifest.json "$sha"
(cd "$stage"; find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS; zip -qry "$out/honsen-procure-server-v1-$sha.zip" .)
sha256sum "$out/honsen-procure-server-v1-$sha.zip" > "$out/honsen-procure-server-v1-$sha.zip.sha256"
