import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const base = new URL(process.env.TEST_API_BASE_URL ?? 'http://127.0.0.1:3000')
assert(['127.0.0.1', 'localhost'].includes(base.hostname))
const state = JSON.parse(
  readFileSync(
    process.env.TEST_BUSINESS_STATE ?? '/evidence/business-state.json',
    'utf8',
  ),
)
const installation = randomUUID()
const c = await (await fetch(new URL('/api/auth/captcha', base))).json(),
  n = c.question.match(/\d+/g).map(Number)
let r = await fetch(new URL('/api/auth/login', base), {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-installation-id': installation,
  },
  body: JSON.stringify({
    username: state.username,
    password: state.password,
    captchaId: c.id,
    captchaAnswer: String(n[0] + n[1]),
  }),
})
assert.equal(r.status, 200)
const token = (await r.json()).accessToken
const root = state.expected.find((e) => e.payload.documentType === 'HPA')
assert(root)
const draft = {
  ...JSON.parse(root.payload.formalSnapshotJson),
  applicantId: state.actor,
  workflowStatus: 'draft',
  status: 'draft',
  confirmedBy: null,
  confirmedAt: null,
  selfApproved: false,
  documentType: null,
  formalDocumentNo: null,
  formalInstallationId: null,
  formalSequence: null,
  formallyIssuedAt: null,
  formalSnapshotJson: null,
}
function event(id, lineId) {
  return {
    eventId: randomUUID(),
    entityId: id,
    entityType: 'purchase_order',
    operation: 'upsert',
    baseVersion: 0,
    payload: {
      ...draft,
      notes: `guard-private-${id}`,
      lines: draft.lines.map((l, index) => ({
        ...l,
        id: index === 0 ? lineId : randomUUID(),
      })),
    },
  }
}
async function push(e) {
  const response = await fetch(new URL('/api/sync/push', base), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ deviceId: installation, events: [e] }),
  })
  assert.equal(response.status, 200)
  return (await response.json()).results[0]
}
const line = randomUUID(),
  inputs = [event(randomUUID(), line), event(randomUUID(), line.toUpperCase())]
const results = await Promise.all(inputs.map(push))
assert.deepEqual(results.map((r) => r.status).sort(), ['accepted', 'conflict'])
const winner = results.findIndex((r) => r.status === 'accepted'),
  loser = 1 - winner
assert.equal(results[loser].serverVersion, 0)
assert.deepEqual(results[loser].serverPayload, {})
assert(!JSON.stringify(results[loser]).includes(inputs[winner].payload.notes))
assert(!JSON.stringify(results[loser]).includes(inputs[winner].entityId))
assert.deepEqual(await push(inputs[loser]), results[loser])
assert.deepEqual(await push(inputs[winner]), results[winner])
const ownUpdate = {
  ...inputs[winner],
  eventId: randomUUID(),
  baseVersion: 1,
  payload: { ...inputs[winner].payload, notes: 'authorized same-order update' },
}
assert.equal((await push(ownUpdate)).status, 'accepted')
assert.equal((await push(event(randomUUID(), randomUUID()))).status, 'accepted')
const tombstone = {
  ...ownUpdate,
  eventId: randomUUID(),
  operation: 'soft_delete',
  baseVersion: 2,
}
assert.equal((await push(tombstone)).status, 'accepted')
assert.equal((await push(event(randomUUID(), line))).status, 'conflict')
const duplicate = event(randomUUID(), randomUUID())
duplicate.payload.lines.push({
  ...duplicate.payload.lines[0],
  id: duplicate.payload.lines[0].id.toUpperCase(),
})
assert.equal((await push(duplicate)).status, 'conflict')
console.log(
  JSON.stringify({
    status: 'PASS',
    scope:
      'actual packaged HTTP concurrent cross-order line UUID guard, case equivalence, retained conflict replay, no occupying-order payload leak, same-order update, unique producer and tombstone reservation',
    concurrentAccepted: 1,
    concurrentConflict: 1,
    secretsLogged: false,
  }),
)
