#!/usr/bin/env bash
set -euo pipefail
root="${REPOSITORY_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
sha="$(git -c safe.directory="$root" -C "$root" rev-parse HEAD)"
out="${RELEASE_OUTPUT:-$root/.cache/server-release}"
mkdir -p "$out"
test ! -e "$out/honsen-procure-server-v1-$sha.zip"
stage="$(mktemp -d)"
trap 'docker run --rm -v "$stage:/work" node:24.22.1-bookworm chown -R "$(id -u):$(id -g)" /work >/dev/null 2>&1 || true; rm -rf -- "$stage"' EXIT
git -c safe.directory="$root" -C "$root" archive "$sha" README-DEPLOY.md start.mjs package.json package-lock.json apps/server packages/shared deploy/baota deploy/linux/grant-api.cjs deploy/linux/api-grant-policy.json | tar -x -C "$stage"
cmp "$stage/README-DEPLOY.md" "$stage/deploy/baota/README.zh-CN.md"
docker run --rm -v honsen-v1-npm-cache:/root/.npm -v "$stage:/work" -w /work node:24.22.1-bookworm bash -euc '
 npm ci --workspace @honsen/server --workspace @honsen/shared --include-workspace-root=false --include=dev --fetch-retries=3
 ./node_modules/.bin/esbuild packages/shared/src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=packages/shared/dist/index.js
 npm run build --workspace @honsen/server
 npm prune --omit=dev
 node deploy/baota/prepare-runtime.cjs
'
cp "$stage/README-DEPLOY.md" "$stage/README.zh-CN.md"
cp "$stage/deploy/baota/.env.example" "$stage/.env.example"
docker run --rm -v "$stage:/work" -w /work node:24.22.1-bookworm node deploy/baota/create-manifest.mjs /work "$sha"
(cd "$stage"; find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS; zip -qry "$out/honsen-procure-server-v1-$sha.zip" .)
sha256sum "$out/honsen-procure-server-v1-$sha.zip" > "$out/honsen-procure-server-v1-$sha.zip.sha256"
