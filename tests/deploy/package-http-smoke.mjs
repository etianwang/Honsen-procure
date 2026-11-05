import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

// Run against the extracted package in an explicitly disposable test environment.
assert.equal(
  process.env.HONSEN_DEPLOY_TEST,
  '1',
  'Disposable test opt-in required',
)
const base = new URL(process.env.TEST_API_BASE_URL ?? '')
assert(
  ['127.0.0.1', 'localhost', '::1'].includes(base.hostname),
  'Loopback API required',
)
assert(
  process.env.TEST_LOGIN_USERNAME && process.env.TEST_LOGIN_PASSWORD,
  'Explicit test account required',
)
const installationId = randomUUID()
async function request(path, options = {}) {
  return fetch(`${base.href.replace(/\/$/, '')}${path}`, options)
}
async function login() {
  const challenge = await request('/api/auth/captcha')
  assert.equal(challenge.status, 200)
  const captcha = await challenge.json()
  const operands = captcha.question.match(/\d+/g).map(Number)
  assert.equal(operands.length, 2)
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-installation-id': installationId,
    },
    body: JSON.stringify({
      username: process.env.TEST_LOGIN_USERNAME,
      password: process.env.TEST_LOGIN_PASSWORD,
      captchaId: captcha.id,
      captchaAnswer: String(operands[0] + operands[1]),
    }),
  })
  assert.equal(response.status, 200, 'Actual package login')
  const session = await response.json()
  assert.equal(typeof session.accessToken, 'string')
  return session.accessToken
}
const token = await login()
const headers = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
}
const pull = await request('/api/sync/pull?cursor=0&limit=100', { headers })
assert.equal(pull.status, 200)
const data = await pull.json()
assert(Array.isArray(data.changes))
assert.equal(typeof data.nextCursor, 'string')
const push = await request('/api/sync/push', {
  method: 'POST',
  headers,
  body: JSON.stringify({ deviceId: installationId, events: [] }),
})
assert.equal(push.status, 200, 'Empty Push contract')
const anonymousPull = await request('/api/sync/pull?cursor=0&limit=100')
assert.equal(anonymousPull.status, 401)
const anonymousPush = await request('/api/sync/push', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ deviceId: installationId, events: [] }),
})
assert.equal(anonymousPush.status, 401)
const secondToken = await login()
assert.notEqual(token, secondToken)
const revoked = await request('/api/sync/pull?cursor=0&limit=100', { headers })
assert.equal(revoked.status, 401, 'G1 old-session rejection after relogin')
const current = await request('/api/sync/pull?cursor=0&limit=100', {
  headers: { authorization: `Bearer ${secondToken}` },
})
assert.equal(current.status, 200)
const proof = {
  status: 'PASS',
  scope:
    'extracted actual HTTP server login/CAPTCHA, empty Push, Pull, anonymous rejection and old-session revocation; excludes business creation, role matrix and restart',
  changes: data.changes.length,
  secretsLogged: false,
}
if (process.env.TEST_HTTP_EVIDENCE)
  writeFileSync(
    process.env.TEST_HTTP_EVIDENCE,
    JSON.stringify(proof, null, 2) + '\n',
  )
console.log(JSON.stringify(proof))
