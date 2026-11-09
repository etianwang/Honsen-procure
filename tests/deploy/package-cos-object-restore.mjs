import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const cleanup = process.env.TEST_COS_MODE === 'cleanup'
const state = JSON.parse(
    readFileSync('/evidence/cos-owned-state.json', 'utf8'),
  ),
  prefix = readFileSync('/evidence/cos-prefix', 'utf8').trim()
assert.equal(state.prefix, prefix)
assert(/^honsen-procure-tests\/[a-f0-9-]{36}\/$/.test(prefix))
const env = {}
for (const line of readFileSync('/run/cos-private.txt', 'utf8').split(
  /\r?\n/,
)) {
  const m =
    /^\s*(COS_REGION|COS_BUCKET|COS_SECRET_ID|COS_SECRET_KEY)\s*=\s*(.*?)\s*$/.exec(
      line,
    )
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
assert.equal(env.COS_REGION, 'eu-frankfurt')
assert.equal(env.COS_BUCKET, 'honsen-materials-1308426049')
const { CosStorage } = await import(
    pathToFileURL(resolve('apps/server/dist/attachments/cos.js'))
  ),
  cos = CosStorage.fromEnvironment(env)
const hash = (b) => createHash('sha256').update(b).digest('hex'),
  proof = []
mkdirSync('/evidence/object-backup', { recursive: true, mode: 0o700 })
for (const [index, o] of state.objects.entries()) {
  assert(o.key.startsWith(prefix))
  assert.equal(
    o.version,
    null,
    'Exact original version restoration requires unversioned owned test object',
  )
  const access = await cos.download(o.key, o.version),
    r = await fetch(access.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
  assert.equal(r.status, 200)
  const bytes = Buffer.from(await r.arrayBuffer())
  assert.equal(hash(bytes), o.checksum)
  assert.equal(bytes.length, o.byteLength)
  writeFileSync(`/evidence/object-backup/${o.id}.bin`, bytes, { mode: 0o600 })
  const deleted = await cos.removeOwnedTestObject(o.key, o.version)
  assert.equal(deleted, 204)
  const missingAccess = await cos.download(o.key, null),
    missing = await fetch(missingAccess.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
  assert.equal(missing.status, 404)
  if (cleanup) {
    proof.push({
      id: o.id,
      key: o.key,
      deleted,
      confirmedMissing: missing.status,
    })
    continue
  }
  const backup = readFileSync(`/evidence/object-backup/${o.id}.bin`)
  assert.equal(hash(backup), o.checksum)
  const mime = ['application/pdf', 'image/heic', 'image/jpeg'][index]
  assert(mime)
  const upload = await cos.upload(o.key, mime, o.checksum, backup.length)
  const restored = await fetch(upload.url, {
    method: 'PUT',
    headers: upload.headers,
    body: backup,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  })
  assert.equal(restored.status, 200)
  assert.equal(restored.headers.get('x-cos-version-id'), null)
  const inspected = await cos.inspect(o.key, backup.length, o.checksum, mime)
  assert.equal(inspected.byteLength, o.byteLength)
  proof.push({
    id: o.id,
    key: o.key,
    backupHash: o.checksum,
    deleted,
    confirmedMissing: missing.status,
    restored: restored.status,
    headSize: inspected.byteLength,
  })
}
writeFileSync(
  cleanup
    ? '/evidence/object-cleanup-proof.json'
    : '/evidence/object-restore-proof.json',
  JSON.stringify(
    {
      status: 'PASS',
      scope: cleanup
        ? 'exact owned COS objects removed and confirmed404; no enumeration'
        : 'actual owned COS object bytes backed up, deleted, confirmed404, restored from backup to same key and independently verified HEAD/hash',
      proof,
    },
    null,
    2,
  ),
)
console.log(
  JSON.stringify({
    status: 'PASS',
    scope: cleanup
      ? 'owned COS objects exact cleanup confirmed404'
      : 'owned COS object backup/delete404/restore bytes',
    objects: proof.length,
  }),
)
