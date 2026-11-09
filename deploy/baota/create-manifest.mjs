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
  apiContract: {
    sharedBundleSha256: digest('packages/shared/dist/index.js'),
    serverEntrySha256: digest('apps/server/dist/index.js'),
  },
  apiBaseUrl: 'https://api-pr.honsen.africa/v1',
  deploymentDirectory: '/www/wwwroot/api-pr/v1/',
  node: '24.22.1',
  postgres: '16.15',
  postgresRequiredExtensions: [],
  deploymentReadme: {
    source: 'README-DEPLOY.md',
    sha256: digest('README-DEPLOY.md'),
    aliases: ['README.zh-CN.md', 'deploy/baota/README.zh-CN.md'],
  },
  baotaEntry: {
    path: 'start.mjs',
    sha256: digest('start.mjs'),
    mode: 'BAOTA_PM2_FORK_SINGLE_INSTANCE_EMPTY_ARGS',
    envFile: '.env',
    listen: '127.0.0.1:3000',
  },
  migrationChecksumCompatibility: {
    module: 'apps/server/dist/db/migration-checksums.js',
    sha256: digest('apps/server/dist/db/migration-checksums.js'),
    policy: 'EXACT_001_PGCRYPTO_DECLARATION_REMOVAL_ONLY_PRESERVE_HISTORY',
  },
  platform: 'linux-x64',
  migrations,
  latestMigration: migrations.at(-1)?.name,
  seed: {
    entry: 'apps/server/dist/scripts/bootstrap-v1.js',
    sha256: digest('apps/server/dist/scripts/bootstrap-v1.js'),
    existingBootstrapTaxEntry:
      'apps/server/dist/scripts/apply-v1-tax-config.js',
    existingBootstrapTaxEntrySha256: digest(
      'apps/server/dist/scripts/apply-v1-tax-config.js',
    ),
    taxConfigHelperSha256: digest('apps/server/dist/scripts/v1-tax-config.js'),
    taxAuthority: 'USER_APPROVED_CONFIGURATION_2026-11-06',
    taxPolicy: {
      CI: { percentage: '18' },
      CM: { percentage: '19.25' },
      stampDuty: 'MANUALLY_ENTERED_ORDER_AMOUNT',
      automaticFixedStampDuty: false,
    },
  },
  acceptance: 'NOT_YET_VERIFIED',
  rollback: 'CANDIDATE_ONLY_REQUIRES_SCHEMA_COMPATIBILITY_AND_VERIFIED_BACKUP',
}
writeFileSync(
  join(root, 'build-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
