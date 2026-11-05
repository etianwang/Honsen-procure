import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const prefix = readFileSync('/evidence/cos-prefix', 'utf8').trim()
assert(/^honsen-procure-tests\/[a-f0-9-]{36}\/$/.test(prefix))
const config = {}
for (const line of readFileSync('/run/cos-private.txt', 'utf8').split(
  /\r?\n/,
)) {
  const m =
    /^\s*(COS_REGION|COS_BUCKET|COS_SECRET_ID|COS_SECRET_KEY)\s*=\s*(.*?)\s*$/.exec(
      line,
    )
  if (m) {
    assert(!config[m[1]])
    config[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
assert.equal(config.COS_REGION, 'eu-frankfurt')
assert.equal(config.COS_BUCKET, 'honsen-materials-1308426049')
for (const key of [
  'COS_REGION',
  'COS_BUCKET',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
])
  assert(config[key])
const load = (p) => import(pathToFileURL(resolve(`apps/server/dist/${p}.js`)))
const { CosStorage } = await load('attachments/cos'),
  { AttachmentService } = await load('attachments/service'),
  { createApp } = await load('app'),
  { AuthService } = await load('auth/service'),
  { createPostgresPool, waitForDatabase } = await load('db/pool'),
  { PostgresAuthStore } = await load('db/postgres-auth-store'),
  { PostgresMasterDataStore } = await load('master-data/postgres-store'),
  { MasterDataService } = await load('master-data/service'),
  { PostgresSyncStore } = await load('sync/postgres-store'),
  { SyncService } = await load('sync/service'),
  { PostgresAuthorizationStore } = await load('authorization/postgres-store'),
  { AuthorizationService } = await load('authorization/service'),
  { registerPasswordChange } = await load('auth/password-change')
const require = createRequire(resolve('apps/server/package.json')),
  argon2 = require('argon2')
const pool = createPostgresPool(readFileSync('/evidence/runtime-url', 'utf8'))
await waitForDatabase(pool)
const cos = CosStorage.fromEnvironment(config)
const guarded = {}
for (const method of ['upload', 'inspect', 'download'])
  guarded[method] = async (key, ...args) => {
    assert(key.startsWith(prefix), 'COS object outside this run')
    return cos[method](key, ...args)
  }
const auth = new AuthService(new PostgresAuthStore(pool), {
  verify: argon2.verify,
})
const Fastify = require('fastify')
const instance =
  process.env.TEST_HTTPS === '1'
    ? Fastify({
        logger: false,
        https: {
          pfx: readFileSync('/run/native-server.pfx'),
          passphrase: readFileSync('/run/native-pfx-pass', 'utf8'),
        },
      })
    : Fastify({ logger: false })
const app = createApp(
  auth,
  new MasterDataService(new PostgresMasterDataStore(pool)),
  new SyncService(new PostgresSyncStore(pool)),
  new AuthorizationService(new PostgresAuthorizationStore(pool)),
  new AttachmentService(pool, guarded, prefix),
  instance,
)
registerPasswordChange(app, auth, pool)
app.addHook('onClose', async () => pool.end())
const port = process.env.TEST_HTTPS === '1' ? 3443 : 3000
await app.listen({ host: '127.0.0.1', port })
console.log(
  JSON.stringify({
    status: 'READY',
    boundary:
      'actual extracted ZIP modules with existing constructor isolated-prefix launcher',
    prefix,
    node: process.version,
  }),
)
