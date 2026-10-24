import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(process.env.HONSEN_PACKAGE_ROOT ?? '.')
test('Linux candidate includes controller, all migrations and restrictive runtime grants', () => {
  for (const file of [
    'grant-api.cjs',
    'verify-api-privileges.cjs',
    'api-grant-policy.json',
    'deploy.sh',
    'verify-restore.sh',
  ]) {
    assert.ok(readFileSync(resolve(root, 'deploy/linux', file)).length > 0)
  }
  const service = readFileSync(
    resolve(root, 'deploy/linux/honsen-procure.service'),
    'utf8',
  )
  assert.match(service, /WorkingDirectory=\/www\/Honsen-procure\/current\n/)
  assert.match(
    service,
    /ConditionPathExists=\/run\/honsen-procure\/deployment-ready/,
  )
  assert.match(service, /Restart=no/)
  const grants = readFileSync(
    resolve(root, 'deploy/linux/postgres/grant-runtime.sql'),
    'utf8',
  )
  assert.doesNotMatch(grants, /ON ALL TABLES|ALTER DEFAULT PRIVILEGES/)
  const server = readdirSync(resolve(root, 'apps/server/migrations'))
  for (const file of [
    '005_procurement_expenditures.sql',
    '006_attachments.sql',
    '011_attachment_derivation.sql',
    '012_payment_sync_compatibility.sql',
  ])
    assert.ok(server.includes(file), file)
  const local = readdirSync(resolve(root, 'apps/desktop/src-tauri/migrations'))
  for (const file of [
    '0032_procurement_expenditures.sql',
    '0033_expenditure_immutability.sql',
    '0034_attachment_transfers.sql',
    '0056_expenditure_branch_compat.sql',
    '0058_payment_sync_metadata.sql',
  ])
    assert.ok(local.includes(file), file)
})

test('release ingress starts in controller-managed maintenance', () => {
  const nginx = readFileSync(
    resolve(root, 'deploy/linux/nginx/honsen-procure.conf'),
    'utf8',
  )
  assert.match(nginx, /include \/etc\/honsen-procure\/nginx-ingress.conf;/)
  const ingress = readFileSync(
    resolve(root, 'deploy/linux/nginx/ingress-maintenance.conf'),
    'utf8',
  )
  assert.match(ingress, /^# honsen-procure managed ingress\nreturn 503;/)
})

test('backup scripts retain every completed archive', () => {
  const backup = readFileSync(
    resolve(root, 'deploy/linux/scripts/backup.sh'),
    'utf8',
  )
  assert.doesNotMatch(backup, /tail -n \+11|mapfile -t expired/)
})
