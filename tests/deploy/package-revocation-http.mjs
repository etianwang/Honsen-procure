import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const base = new URL(process.env.TEST_API_BASE_URL)
assert(['localhost', '127.0.0.1'].includes(base.hostname))
const s = JSON.parse(readFileSync(process.env.TEST_BUSINESS_STATE, 'utf8'))
const u = new URL(process.env.TEST_DATABASE_URL)
assert(u.pathname.includes('test'))
const require = createRequire(resolve('apps/server/package.json')),
  { Pool } = require('pg'),
  db = new Pool({ connectionString: u.href })
const installation = randomUUID()
async function login(username) {
  let r = await fetch(new URL('/api/auth/captcha', base))
  const c = await r.json(),
    n = c.question.match(/\d+/g).map(Number)
  r = await fetch(new URL('/api/auth/login', base), {
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
async function push(token, payload) {
  const r = await fetch(new URL('/api/sync/push', base), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      deviceId: installation,
      events: [
        {
          eventId: randomUUID(),
          entityId: randomUUID(),
          entityType: 'purchase_order',
          operation: 'upsert',
          baseVersion: 0,
          payload,
        },
      ],
    }),
  })
  assert.equal(r.status, 200)
  return (await r.json()).results[0]
}
const draft = {
  ...s.expected[0].payload,
  applicantId: s.engineer,
  workflowStatus: 'draft',
  confirmedBy: null,
  confirmedAt: null,
  documentType: null,
  formalDocumentNo: null,
  formalInstallationId: null,
  formalSequence: null,
  formallyIssuedAt: null,
  formalSnapshotJson: null,
}
try {
  const actorToken = await login(s.username),
    engToken = await login(s.engineerName)
  await db.query('UPDATE users SET is_enabled=false WHERE id=$1', [s.actor])
  let r = await fetch(new URL('/api/sync/pull?cursor=0&limit=500', base), {
    headers: { authorization: `Bearer ${actorToken}` },
  })
  assert.equal(r.status, 401)
  await db.query('UPDATE users SET is_enabled=true WHERE id=$1', [s.actor])
  await db.query(
    "DELETE FROM user_roles WHERE user_id=$1 AND role='purchaser'",
    [s.actor],
  )
  assert.equal(
    (await push(actorToken, { ...draft, applicantId: s.actor })).status,
    'validation_error',
  )
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'purchaser')",
    [s.actor],
  )
  await db.query(
    'DELETE FROM user_project_scope_bindings WHERE user_id=$1 AND project_id=$2',
    [s.engineer, s.project],
  )
  await db.query(
    'DELETE FROM user_project_bindings WHERE user_id=$1 AND project_id=$2',
    [s.engineer, s.project],
  )
  assert.equal((await push(engToken, draft)).status, 'validation_error')
  console.log(
    JSON.stringify({
      status: 'PASS',
      scope:
        'actual packaged runtime HTTP disabled-account401, purchaser-role-revoked write denial and engineer-project-binding-revoked write denial; not native G1 acceptance',
    }),
  )
} finally {
  await db.query('UPDATE users SET is_enabled=true WHERE id=$1', [s.actor])
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'purchaser') ON CONFLICT DO NOTHING",
    [s.actor],
  )
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
