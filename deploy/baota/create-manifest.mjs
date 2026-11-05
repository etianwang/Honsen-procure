import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.argv[2]
const sha = process.argv[3]
if (!/^[a-f0-9]{40}$/.test(sha ?? ''))
  throw new Error('Exact source SHA required')
function digest(path) {
  return createHash('sha256')
    .update(readFileSync(join(root, path)))
    .digest('hex')
}
const migrations = readdirSync(join(root, 'apps/server/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sha256: digest(`apps/server/migrations/${name}`) }))
const manifest = {
  schemaVersion: 1,
  sourceSha: sha,
  softwareVersion: JSON.parse(
    readFileSync(join(root, 'apps/server/package.json')),
  ).version,
  apiVersion: 'v1',
  apiBaseUrl: 'https://api-pr.honsen.africa/v1',
  deploymentDirectory: '/www/wwwroot/api-pr/v1/',
  node: '24.22.1',
  postgres: '16.15',
  platform: 'linux-x64',
  migrations,
  latestMigration: migrations.at(-1)?.name,
  seed: {
    entry: 'apps/server/dist/scripts/bootstrap-v1.js',
    sha256: digest('apps/server/dist/scripts/bootstrap-v1.js'),
    referenceDataSha256: digest('seed/master-data.json'),
    taxAuthority: 'UNVERIFIED_NOT_SEEDED',
  },
  acceptance: 'NOT_YET_VERIFIED',
  rollback: 'CANDIDATE_ONLY_REQUIRES_SCHEMA_COMPATIBILITY_AND_VERIFIED_BACKUP',
}
writeFileSync(
  join(root, 'build-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
