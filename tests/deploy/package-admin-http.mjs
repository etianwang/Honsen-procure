import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const base = new URL(process.env.TEST_API_BASE_URL)
assert(['127.0.0.1', 'localhost'].includes(base.hostname))
async function login(password) {
  const c = await (await fetch(new URL('/api/auth/captcha', base))).json()
  const n = c.question.match(/\d+/g).map(Number)
  return fetch(new URL('/api/auth/login', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-installation-id': randomUUID(),
    },
    body: JSON.stringify({
      username: 'admin',
      password,
      captchaId: c.id,
      captchaAnswer: String(n[0] + n[1]),
    }),
  })
}
const initial = process.env.TEST_BOOTSTRAP_PASSWORD
assert(initial)
let r = await login(initial)
assert.equal(r.status, 200)
const first = await r.json()
assert.equal(first.user.requiresPasswordChange, false)
assert.equal(first.user.passwordChangeRecommended, true)
r = await fetch(new URL('/api/sync/pull?cursor=0&limit=500', base), {
  headers: { authorization: `Bearer ${first.accessToken}` },
})
assert.equal(r.status, 200)
const changes = (await r.json()).changes
assert.equal(changes.filter((c) => c.entityType === 'country').length, 2)
assert.equal(changes.filter((c) => c.entityType === 'project').length, 3)
assert.equal(changes.filter((c) => c.entityType === 'unit').length, 14)
assert.equal(changes.filter((c) => c.entityType === 'site').length, 0)
const password = randomBytes(24).toString('base64url')
r = await fetch(new URL('/api/auth/change-password', base), {
  method: 'POST',
  headers: {
    authorization: `Bearer ${first.accessToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ currentPassword: initial, newPassword: password }),
})
assert.equal(r.status, 200)
assert.equal((await r.json()).requiresLogin, true)
r = await fetch(new URL('/api/sync/pull?cursor=0&limit=1', base), {
  headers: { authorization: `Bearer ${first.accessToken}` },
})
assert.equal(r.status, 401)
r = await login(initial)
assert.equal(r.status, 401)
r = await login(password)
assert.equal(r.status, 200)
const changed = await r.json()
assert.equal(changed.user.passwordChangeRecommended ?? false, false)
assert.equal(changed.user.requiresPasswordChange, false)
console.log(
  JSON.stringify({
    status: 'PASS',
    scope:
      'actual packaged API initial admin password/advisory, seed Pull counts, password change, old password and session rejection',
    countries: 2,
    projects: 3,
    units: 14,
    sites: 0,
    secretsLogged: false,
  }),
)
