import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
test('manual Baota deployment isolates credentials and uses the www application path', () => {
  const unit = read('deploy/linux/manual/honsen-procure.service')
  assert.match(unit, /User=www/)
  assert.match(unit, /WorkingDirectory=\/www\/Honsen-procure\/app\/current/)
  assert.match(unit, /EnvironmentFile=\/etc\/honsen-procure\/server.env/)
  assert.ok(!unit.includes('backups'))
  const guide = read('deploy/linux/README.zh-CN.md')
  assert.ok(!guide.includes('ON ALL TABLES'))
  assert.ok(existsSync(new URL('deploy/linux/.env.production.example', root)))
  const pack = read('deploy/linux/scripts/build-release.sh')
  assert.ok(pack.includes('api-grant-policy.json'))
})
