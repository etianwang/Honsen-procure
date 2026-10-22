import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'

const root = process.env.HONSEN_QA_ROOT,
  profile = process.env.HONSEN_PROCURE_TEST_DB_PATH
const report = {
  candidate: '5708b19caf019b29dae9f420380c6ae7316184a6',
  errors: [],
  requests: [],
}
const child = spawn(process.env.HONSEN_QA_EXE, [], {
  windowsHide: true,
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
      '--remote-debugging-port=9264 --remote-debugging-address=127.0.0.1',
    WEBVIEW2_USER_DATA_FOLDER: `${profile}.webview`,
  },
})
let browser, page
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch('http://127.0.0.1:9264/json/version')).ok
        } catch {
          return false
        }
      },
      { timeout: 60000 },
    )
    .toBe(true)
  browser = await chromium.connectOverCDP('http://127.0.0.1:9264')
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  page = browser.contexts()[0].pages()[0]
  page.on('pageerror', (e) => report.errors.push(e.message))
  page.on('response', (response) => {
    if (response.url().includes('ipc.localhost'))
      report.requests.push({ url: response.url(), status: response.status() })
  })
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible({ timeout: 90000 })
  report.webview = await page.evaluate(() => ({
    readyState: document.readyState,
    elapsedMs: Math.round(performance.now()),
    invokeType: typeof window.__TAURI_INTERNALS__?.invoke,
  }))
  await page.locator('#account').fill('purchaser')
  await page
    .locator('#password')
    .fill(process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  await page.getByRole('button', { name: '获取验证码' }).click()
  await expect(page.locator('label[for=captcha]')).toContainText('= ?', {
    timeout: 30000,
  })
  const question = await page.locator('label[for=captcha]').textContent(),
    match = /(\d+) \+ (\d+) = \?/.exec(question)
  assert.ok(match)
  await page
    .locator('#captcha')
    .fill(String(Number(match[1]) + Number(match[2])))
  const loginAt = Date.now()
  await page.getByRole('button', { name: '离线登录' }).click()
  await expect(page.getByLabel('当前授权范围')).toBeVisible({ timeout: 60000 })
  report.contextReadyMs = Date.now() - loginAt
  report.context = await page.evaluate(() =>
    window.__TAURI__.core.invoke('get_authorization_context'),
  )
  assert.equal(report.context.countryId, '10000000-0000-4000-8000-000000000001')
  await page.getByRole('button', { name: '材料库', exact: true }).click()
  await page.getByRole('button', { name: '供应商管理' }).click()
  await page.getByRole('button', { name: '新增供应商' }).click()
  await page.getByLabel('供应商编码').fill('QA-TIMING-RECHECK')
  await page.getByLabel('供应商名称').fill('QA timing recheck')
  const saveAt = Date.now()
  await page.getByRole('button', { name: '保存供应商' }).click()
  await expect(page.getByText('供应商已保存')).toBeVisible({ timeout: 60000 })
  report.saveNoticeMs = Date.now() - saveAt
  const db = new DatabaseSync(profile, { readOnly: true })
  db.exec('PRAGMA busy_timeout=5000')
  report.row = db
    .prepare(
      'SELECT name,country_id FROM local_suppliers WHERE business_code=?',
    )
    .get('QA-TIMING-RECHECK')
  report.outbox = db
    .prepare(
      'SELECT COUNT(*) AS n FROM local_sync_outbox WHERE entity_type=? AND entity_id=(SELECT id FROM local_suppliers WHERE business_code=?)',
    )
    .get('supplier', 'QA-TIMING-RECHECK').n
  db.close()
  assert.equal(report.row.country_id, report.context.countryId)
  assert.equal(report.outbox, 1)
  report.result = 'PASS'
} catch (error) {
  report.result = 'FAIL'
  report.failure = String(error.stack ?? error)
  if (page)
    report.failureBody = await page
      .locator('body')
      .innerText()
      .catch(() => '')
  process.exitCode = 1
} finally {
  writeFileSync(
    join(root, 'timeout-recheck.json'),
    JSON.stringify(report, null, 2),
  )
  if (browser) await browser.close().catch(() => {})
  child.kill()
}
