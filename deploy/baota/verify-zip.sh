#!/usr/bin/env bash
set -euo pipefail
zip_path="$(realpath "${1:?ZIP path required}")"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
unzip -q "$zip_path" -d "$work"
(cd "$work"; sha256sum --quiet -c SHA256SUMS)
# Test-only secret files may never enter a release archive.
if find "$work" -type f \( -name '.env' -o -name '.env.test' -o -iname 'cos.txt' -o -name '*.pem' -o -name '*.key' -o -name '*.pfx' \) | grep .; then
  echo 'Secret file in package' >&2; exit 1
fi
node_files=$(find "$work/node_modules" -name '*.node' -type f)
test -n "$node_files"
while IFS= read -r file; do
  file "$file" | grep -q ELF || { echo "Non-Linux native dependency: $file" >&2; exit 1; }
done <<< "$node_files"
docker run --rm -v "$work:/work:ro" -w /work node:24.22.1-bookworm node --input-type=module -e 'import argon2 from "argon2"; import {Client} from "pg"; import "@honsen/shared"; console.log(JSON.stringify({node:process.version,platform:process.platform,argon2:await argon2.verify(await argon2.hash("synthetic-package-proof"),"synthetic-package-proof"),pg:typeof Client}));'
printf 'ZIP integrity and Linux module load PASS\n'
