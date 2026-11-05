import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const base = 'http://127.0.0.1:3000',
  installation = randomUUID()
const s = JSON.parse(readFileSync('/evidence/business-state.json', 'utf8')),
  prefix = readFileSync('/evidence/cos-prefix', 'utf8').trim(),
  statePath = '/evidence/cos-owned-state.json'
assert(/^honsen-procure-tests\/[a-f0-9-]{36}\/$/.test(prefix))
const sha = (b) => createHash('sha256').update(b).digest('hex')
async function login(username = s.username) {
  const c = await (await fetch(base + '/api/auth/captcha')).json(),
    n = c.question.match(/\d+/g).map(Number)
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-installation-id': installation,
    },
    body: JSON.stringify({
      username,
      password: s.password,
      captchaId: c.id,
      captchaAnswer: String(n[0] + n[1]),
    }),
  })
  assert.equal(r.status, 200)
  return (await r.json()).accessToken
}
async function request(path, token, body) {
  return fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
const token = await login()
if (process.env.TEST_COS_MODE === 'verify') {
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  for (const o of state.objects) {
    const r = await request(`/api/attachments/${o.id}/download`, token)
    assert.equal(r.status, 200)
    const access = await r.json()
    assert.equal(access.metadata.objectKey, o.key)
    assert.equal(access.metadata.versionId, o.version)
    assert.equal(access.metadata.checksum, o.checksum)
    assert.equal(access.metadata.sourceAttachmentId, o.sourceAttachmentId)
    const data = await fetch(access.download.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    assert.equal(data.status, 200)
    const bytes = Buffer.from(await data.arrayBuffer())
    assert.equal(bytes.length, o.byteLength)
    assert.equal(sha(bytes), o.checksum)
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      scope:
        'actual packaged HTTP restored PostgreSQL metadata/version pins and restored owned COS bytes with HEIC derivative relation',
      objects: state.objects.length,
    }),
  )
} else {
  const objects = []
  writeFileSync(statePath, JSON.stringify({ prefix, objects }), { mode: 0o600 })
  const orderId = s.expected[0].id,
    sourceId = randomUUID()
  for (const [name, mime, bytes, id, sourceAttachmentId] of [
    [
      'proof.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4\n% actual isolated packaged COS proof\n%%EOF\n'),
      randomUUID(),
      undefined,
    ],
    [
      'source.heic',
      'image/heic',
      readFileSync('/fixtures/gradient-512.heic'),
      sourceId,
      undefined,
    ],
    [
      'derived.jpg',
      'image/jpeg',
      readFileSync('/fixtures/gradient-512.jpg'),
      randomUUID(),
      sourceId,
    ],
  ]) {
    const input = {
      id,
      orderId,
      ownerType: 'purchase_order',
      ownerId: orderId,
      originalName: name,
      contentType: mime,
      byteLength: bytes.length,
      checksum: sha(bytes),
      ...(sourceAttachmentId ? { sourceAttachmentId } : {}),
    }
    let r = await request('/api/attachments/prepare', token, input)
    assert.equal(r.status, 200)
    const prepared = await r.json()
    const url = new URL(prepared.upload.url)
    const key = decodeURIComponent(url.pathname.slice(1))
    assert(key.startsWith(prefix))
    assert.equal(
      url.host,
      'honsen-materials-1308426049.cos.eu-frankfurt.myqcloud.com',
    )
    r = await request('/api/attachments/prepare', token, input)
    assert.equal(r.status, 200)
    assert.equal(new URL((await r.json()).upload.url).pathname, url.pathname)
    r = await fetch(prepared.upload.url, {
      method: 'PUT',
      headers: prepared.upload.headers,
      body: bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    assert.equal(r.status, 200)
    const owned = {
      id,
      key,
      checksum: input.checksum,
      byteLength: bytes.length,
      version: r.headers.get('x-cos-version-id'),
      ...(sourceAttachmentId ? { sourceAttachmentId } : {}),
    }
    objects.push(owned)
    writeFileSync(statePath, JSON.stringify({ prefix, objects }), {
      mode: 0o600,
    })
    const duplicate = await fetch(prepared.upload.url, {
      method: 'PUT',
      headers: prepared.upload.headers,
      body: bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    assert.equal(duplicate.status, 409)
    r = await request(`/api/attachments/${id}/complete`, token, {})
    assert.equal(r.status, 200)
    const metadata = await r.json()
    owned.version = metadata.versionId
    assert.equal(metadata.checksum, input.checksum)
    assert.equal(metadata.byteLength, bytes.length)
    assert.equal(metadata.objectKey, key)
    assert.equal(metadata.sourceAttachmentId, sourceAttachmentId)
    r = await request(`/api/attachments/${id}/complete`, token, {})
    assert.equal(r.status, 200)
    r = await request(`/api/attachments/${id}/download`, token)
    assert.equal(r.status, 200)
    const access = await r.json()
    const get = await fetch(access.download.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    assert.equal(get.status, 200)
    assert.equal(sha(Buffer.from(await get.arrayBuffer())), input.checksum)
    const anonymous = await request(`/api/attachments/${id}/download`)
    assert.equal(anonymous.status, 401)
    const replacement = await request('/api/attachments/prepare', token, {
      ...input,
      checksum: '0'.repeat(64),
    })
    assert.equal(replacement.status, 409)
    writeFileSync(statePath, JSON.stringify({ prefix, objects }), {
      mode: 0o600,
    })
  }
  const engineerToken = await login(s.engineerName),
    deniedUpload = await request('/api/attachments/prepare', engineerToken, {
      id: randomUUID(),
      orderId,
      ownerType: 'purchase_order',
      ownerId: orderId,
      originalName: 'denied.pdf',
      contentType: 'application/pdf',
      byteLength: 9,
      checksum: '0'.repeat(64),
    })
  assert.equal(deniedUpload.status, 403)
  const require = createRequire(resolve('apps/server/package.json')),
    { Pool } = require('pg'),
    db = new Pool({
      connectionString: readFileSync('/evidence/owner-url', 'utf8'),
    })
  try {
    for (const o of objects)
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM server_change_log WHERE entity_type='attachment' AND entity_id=$1",
            [o.id],
          )
        ).rows[0].n,
        1,
      )
    await db.query(
      'DELETE FROM user_project_scope_bindings WHERE user_id=$1 AND project_id=$2',
      [s.engineer, s.project],
    )
    await db.query(
      'DELETE FROM user_project_bindings WHERE user_id=$1 AND project_id=$2',
      [s.engineer, s.project],
    )
    const denied = await request(
      `/api/attachments/${objects[0].id}/download`,
      engineerToken,
    )
    assert.equal(denied.status, 403)
  } finally {
    await db.query(
      'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [s.engineer, s.project],
    )
    await db.query(
      'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [s.engineer, s.project, s.department, s.team],
    )
    await db.end()
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      scope:
        'actual extracted ZIP HTTP COS PDF/HEIC/JPEG bytes+hash+metadata, duplicate PUT409, prepare/complete idempotency, one publication, anonymous401, unauthorized role403, cross-project scope403 and immutable replacement409',
      objects: objects.map((o) => ({
        id: o.id,
        key: o.key,
        checksum: o.checksum,
        byteLength: o.byteLength,
        sourceAttachmentId: o.sourceAttachmentId,
      })),
    }),
  )
}
