import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'

const dbPath = process.env.HONSEN_PROCURE_TEST_DB_PATH
const exe = process.env.HONSEN_QA_EXE
const reportPath = process.env.HONSEN_QA_REPORT
assert.ok(dbPath?.endsWith('.test.sqlite') && exe && reportPath)
const db = new DatabaseSync(dbPath)
db.exec('PRAGMA busy_timeout=5000')
const countryA = '10000000-0000-4000-8000-000000000001'
const countryB = '20000000-0000-4000-8000-000000000001'
const supplierB = '20000000-0000-4000-8000-000000000006'
const seeded = '10000000-0000-4000-8000-000000000006'
db.exec(`INSERT INTO local_countries (id,business_code,name,time_zone,is_active,version) VALUES ('${countryB}','QA-B','QA B','UTC',1,1);
 INSERT INTO local_suppliers (id,business_code,name,country_id,is_active,is_blacklisted,is_preferred,version) VALUES ('${supplierB}','QA-B-SUP','QA B supplier','${countryB}',1,0,0,1)`)
const pricesBefore = db
  .prepare('SELECT * FROM local_material_prices WHERE supplier_id=?')
  .all(seeded)
const report = {
  testedSha: '5708b19caf019b29dae9f420380c6ae7316184a6',
  exe,
  exeSha256: createHash('sha256').update(readFileSync(exe)).digest('hex'),
  checks: [],
  errors: [],
}
const pass = (name) => report.checks.push(name)
const child = spawn(exe, [], {
  windowsHide: true,
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
      '--remote-debugging-port=9257 --remote-debugging-address=127.0.0.1',
    WEBVIEW2_USER_DATA_FOLDER: `${dbPath}.webview`,
  },
})
let browser
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch('http://127.0.0.1:9257/json/version')).ok
        } catch {
          return false
        }
      },
      { timeout: 60000 },
    )
    .toBe(true)
  browser = await chromium.connectOverCDP('http://127.0.0.1:9257')
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  const page = browser.contexts()[0].pages()[0]
  page.on('pageerror', (e) => report.errors.push(e.message))
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible({ timeout: 30000 })
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke),
    'function',
  )
  await page.locator('#account').fill('purchaser')
  await page
    .locator('#password')
    .fill(process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  await page.getByRole('button', { name: '获取验证码' }).click()
  await expect(page.locator('label[for=captcha]')).toContainText('= ?')
  const question = await page.locator('label[for=captcha]').textContent()
  const match = /(\d+) \+ (\d+) = \?/.exec(question)
  assert.ok(match)
  await page
    .locator('#captcha')
    .fill(String(Number(match[1]) + Number(match[2])))
  await page.getByRole('button', { name: '离线登录' }).click()
  await page.getByRole('button', { name: '材料库', exact: true }).click()
  await page.getByRole('button', { name: '供应商管理' }).click()
  await page.getByRole('button', { name: '新增供应商' }).click()
  await page.getByLabel('供应商编码').fill('QA-PR17-NEW')
  await page.getByLabel('供应商名称').fill('QA supplier new')
  await page.getByRole('button', { name: '保存供应商' }).click()
  await expect(page.getByText('供应商已保存')).toBeVisible()
  const created = db
    .prepare(
      'SELECT id,country_id,name FROM local_suppliers WHERE business_code=?',
    )
    .get('QA-PR17-NEW')
  assert.equal(created.country_id, countryA)
  assert.equal(created.name, 'QA supplier new')
  pass('UI create persisted in current country A')
  await page
    .getByRole('row')
    .filter({ hasText: 'QA-PR17-NEW' })
    .getByRole('button', { name: '编辑供应商' })
    .click()
  await page.getByLabel('供应商名称').fill('QA supplier edited')
  await page.getByRole('button', { name: '保存供应商' }).click()
  await expect
    .poll(
      () =>
        db
          .prepare('SELECT name FROM local_suppliers WHERE id=?')
          .get(created.id).name,
    )
    .toBe('QA supplier edited')
  assert.equal(
    db
      .prepare('SELECT country_id FROM local_suppliers WHERE id=?')
      .get(created.id).country_id,
    countryA,
  )
  pass('UI edit persisted and retained country A')
  const outbox = db
    .prepare(
      'SELECT payload_json FROM local_sync_outbox WHERE entity_type=? AND entity_id=? ORDER BY rowid',
    )
    .all('supplier', created.id)
    .map((row) => JSON.parse(row.payload_json))
  assert.deepEqual(
    outbox.map((event) => [event.name, event.countryId]),
    [
      ['QA supplier new', countryA],
      ['QA supplier edited', countryA],
    ],
  )
  pass('SQLite outbox retains country A in create and edit payloads')
  const call = (command, args) =>
    page.evaluate(
      async ({ command, args }) => {
        try {
          return {
            ok: true,
            value: await window.__TAURI__.core.invoke(command, args),
          }
        } catch (error) {
          return { ok: false, error }
        }
      },
      { command, args },
    )
  const list = await call('list_suppliers')
  assert.ok(
    list.ok &&
      list.value.some((s) => s.id === created.id) &&
      !list.value.some((s) => s.id === supplierB),
  )
  const original = list.value.find((s) => s.id === created.id)
  const forged = await call('save_supplier', {
    supplier: { ...original, countryId: countryB, name: 'forged' },
  })
  assert.equal(forged.ok, false)
  const attackB = await call('save_supplier', {
    supplier: {
      ...original,
      id: supplierB,
      businessCode: 'QA-B-SUP',
      countryId: countryB,
      name: 'attack',
    },
  })
  assert.equal(attackB.ok, false)
  const disguiseB = await call('save_supplier', {
    supplier: {
      ...original,
      id: supplierB,
      businessCode: 'QA-B-SUP',
      countryId: countryA,
      name: 'attack',
    },
  })
  assert.equal(disguiseB.ok, false)
  assert.equal(
    db.prepare('SELECT name FROM local_suppliers WHERE id=?').get(supplierB)
      .name,
    'QA B supplier',
  )
  assert.equal(
    db
      .prepare('SELECT country_id FROM local_suppliers WHERE id=?')
      .get(created.id).country_id,
    countryA,
  )
  pass('real IPC denies forged country and cross-country write; list hides B')
  await page
    .getByRole('row')
    .filter({ hasText: 'TEST-SUPPLIER' })
    .getByRole('button', { name: '编辑供应商' })
    .click()
  await page.getByLabel('供应商名称').fill('QA seeded supplier edited')
  await page.getByRole('button', { name: '保存供应商' }).click()
  await expect
    .poll(
      () =>
        db.prepare('SELECT name FROM local_suppliers WHERE id=?').get(seeded)
          .name,
    )
    .toBe('QA seeded supplier edited')
  assert.deepEqual(
    db
      .prepare('SELECT * FROM local_material_prices WHERE supplier_id=?')
      .all(seeded),
    pricesBefore,
  )
  pass('editing supplier preserves linked material price records')
  assert.equal((await call('lock_session')).ok, true)
  const captcha = await call('issue_local_captcha')
  const parts = /^(\d+) \+ (\d+) = \?$/.exec(captcha.value.question)
  assert.ok(parts)
  assert.equal(
    (
      await call('offline_login', {
        request: {
          username: 'engineer-a',
          password: process.env.HONSEN_TEST_ENGINEER_A_PASSWORD,
          captchaId: captcha.value.id,
          captchaAnswer: Number(parts[1]) + Number(parts[2]),
        },
      })
    ).ok,
    true,
  )
  const engineerList = await call('list_suppliers')
  assert.ok(
    engineerList.ok && !engineerList.value.some((s) => s.id === supplierB),
  )
  assert.equal(
    (
      await call('save_supplier', {
        supplier: { ...original, countryId: countryB, name: 'engineer attack' },
      })
    ).ok,
    false,
  )
  pass('engineer cannot view B or forge supplier country')
  assert.deepEqual(report.errors, [])
  report.result = 'PASS'
} catch (error) {
  report.result = 'FAIL'
  report.failure = String(error.stack || error)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  child.kill()
  db.close()
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
}
