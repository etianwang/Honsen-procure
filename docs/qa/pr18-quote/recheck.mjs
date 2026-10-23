import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
const root = process.cwd(),
  dbPath = `${root}\\.qa-pr18\\quotes.test.sqlite`
const materialId = '10000000-0000-4000-8000-000000000005',
  projectId = '10000000-0000-4000-8000-000000000002'
const db = new DatabaseSync(dbPath)
db.exec(
  "INSERT OR IGNORE INTO local_material_prices (id,material_id,supplier_id,currency,unit_price_minor,unit,effective_at,is_active,version) VALUES ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','USD',1234,'米','2026-10-12',1,1); UPDATE local_material_prices SET is_active=1 WHERE id='40000000-0000-4000-8000-000000000002'; UPDATE local_suppliers SET is_blacklisted=1 WHERE id='30000000-0000-4000-8000-000000000032'; UPDATE local_material_prices SET is_active=0 WHERE id='40000000-0000-4000-8000-000000000031'",
)
db.close()
const env = {
  ...process.env,
  HONSEN_PROCURE_PROFILE: 'test',
  HONSEN_PROCURE_TEST_DB_PATH: dbPath,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
    '--remote-debugging-port=19257 --remote-debugging-address=127.0.0.1',
  WEBVIEW2_USER_DATA_FOLDER: `${root}\\.qa-pr18\\continued-webview`,
}
const child = spawn(
  `${root}\\.qa-pr18\\cargo-target\\debug\\HonsenProcure.exe`,
  [],
  { env, windowsHide: true },
)
const result = {
  sha: '0f9895ae4df12abdccda57246c13eccebb66e000',
  checks: [],
  errors: [],
}
let browser
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch('http://127.0.0.1:19257/json/version')).ok
        } catch {
          return false
        }
      },
      { timeout: 60000 },
    )
    .toBe(true)
  browser = await chromium.connectOverCDP('http://127.0.0.1:19257')
  const page = browser.contexts()[0].pages()[0]
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible({ timeout: 60000 })
  await page.locator('#account').fill('purchaser')
  await page.locator('#password').fill('qa-synthetic-purchaser')
  await page.getByRole('button', { name: '获取验证码' }).click()
  const label = page.locator('label[for=captcha]')
  await expect(label).toContainText('= ?')
  const m = /(\d+) \+ (\d+) = \?/.exec(await label.textContent())
  await page.locator('#captcha').fill(String(+m[1] + +m[2]))
  await page.getByRole('button', { name: '离线登录' }).click()
  await page
    .getByRole('button', { name: '材料库', exact: true })
    .waitFor({ timeout: 60000 })
  const call = (command, args) =>
    page.evaluate(
      async ({ command, args }) => {
        try {
          return {
            ok: true,
            value: await window.__TAURI__.core.invoke(command, args),
          }
        } catch (e) {
          return { ok: false, error: e }
        }
      },
      { command, args },
    )
  const args = { materialId, projectId, after: null, includeBlacklisted: false }
  const first = await call('list_catalog_prices', args)
  if (!first.ok) throw Error(JSON.stringify(first))
  const second = await call('list_catalog_prices', {
    ...args,
    after: first.value.at(-1).priceId,
  })
  const ids = [...first.value, ...second.value].map((x) => x.priceId)
  result.pages = {
    first: first.value.length,
    second: second.value.length,
    unique: new Set(ids).size,
    ids,
  }
  if (ids.length !== 32 || new Set(ids).size !== 32)
    throw Error('pagination count/uniqueness failed')
  result.checks.push(
    'real IPC 32 distinct active selectable quotes over both pages',
  )
  const malformed = await call('list_catalog_prices', {
    ...args,
    after: 'not-a-uuid',
  })
  const unknown = await call('list_catalog_prices', {
    ...args,
    after: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  })
  const again = await call('list_catalog_prices', args)
  result.cursor = { malformed, unknown, againCount: again.value?.length }
  if (malformed.ok || !unknown.ok || unknown.value.length || !again.ok)
    throw Error('cursor behavior failed')
  result.checks.push(
    'malformed cursor rejected, valid unknown cursor returns empty, subsequent query succeeds',
  )
  if (
    ids.includes('40000000-0000-4000-8000-000000000031') ||
    ids.includes('40000000-0000-4000-8000-000000000032')
  )
    throw Error('inactive or blacklisted selectable')
  result.checks.push(
    'inactive and blacklisted omitted from actual selectable IPC',
  )
  await page.getByRole('button', { name: '采购申请单' }).click()
  await page.getByLabel('材料').click()
  await page.getByText('合成测试电缆 · TEST-3X2.5', { exact: true }).click()
  await page.getByRole('button', { name: '加载更多报价' }).click()
  await page.getByLabel('选择供应商报价').click()
  await expect(
    page.getByRole('option', { name: /QA Vendor 26 ·/ }),
  ).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/QA Vendor 32 ·/)).toHaveCount(0)
  await expect(page.getByText(/QA Vendor 31 ·/)).toHaveCount(0)
  result.optionLabels = await page.getByRole('option').allTextContents()
  await page.getByRole('option', { name: /QA Vendor 1 ·.*12[.,]34/ }).click()
  await expect(page.getByLabel('单价（最小货币单位）')).toHaveValue('1234')
  await page.getByLabel('数量').fill('3')
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('草稿已自动保存到本机')).toBeVisible({
    timeout: 30000,
  })
  let read = new DatabaseSync(dbPath, { readOnly: true })
  result.currency = read
    .prepare(
      'SELECT id,order_id,supplier_snapshot_json,currency,unit_price_minor,quantity_decimal,line_total_minor FROM local_purchase_order_items ORDER BY rowid DESC LIMIT 1',
    )
    .get()
  read.close()
  if (
    result.currency.currency !== 'USD' ||
    result.currency.line_total_minor !== 3702
  )
    throw Error('currency result incorrect')
  result.checks.push(
    'USD quote selected, saved USD 1234 x 3 = 3702; inactive and blacklisted absent in selector',
  )
  await page.getByLabel('选择供应商报价').click()
  await page.getByText(/QA Vendor 26 ·/).click()
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('草稿已自动保存到本机')).toBeVisible()
  await page.waitForTimeout(1500)
  read = new DatabaseSync(dbPath, { readOnly: true })
  read.exec('PRAGMA busy_timeout=10000')
  result.quote26 = read
    .prepare(
      'SELECT catalog_price_id,price_source FROM local_purchase_order_items WHERE id=?',
    )
    .get(result.currency.id)
  read.close()
  if (
    result.quote26.catalog_price_id !==
      '40000000-0000-4000-8000-000000000026' ||
    result.quote26.price_source !== 'catalog'
  )
    throw Error('quote 26 identity not saved')
  result.checks.push('26th quote identity persisted')
  await page.getByLabel('选择供应商报价').click()
  await page.getByText(/QA Vendor 2 ·/).click()
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('草稿已自动保存到本机')).toBeVisible()
  await page.waitForTimeout(1500)
  const change = new DatabaseSync(dbPath)
  change.exec('PRAGMA busy_timeout=10000')
  change
    .prepare('UPDATE local_material_prices SET is_active=0 WHERE id=?')
    .run('40000000-0000-4000-8000-000000000002')
  change.close()
  await page.getByRole('button', { name: '保存草稿' }).click()
  await page.waitForTimeout(1500)
  read = new DatabaseSync(dbPath, { readOnly: true })
  read.exec('PRAGMA busy_timeout=10000')
  result.stale = read
    .prepare(
      'SELECT supplier_snapshot_json,currency,unit_price_minor,line_total_minor FROM local_purchase_order_items WHERE id=?',
    )
    .get(result.currency.id)
  read.close()
  result.staleNotice = await page.locator('body').innerText()
  await page.screenshot({ path: `${root}\\.qa-pr18\\recheck-stale.png` })
  if (!result.staleNotice.includes('所选报价已失效或不可用'))
    throw Error('stale save was not rejected')
  result.checks.push('stale save rejected with recoverable error')
  await page.getByRole('button', { name: '提交确认' }).click()
  await page.waitForTimeout(2000)
  const finalDb = new DatabaseSync(dbPath, { readOnly: true })
  finalDb.exec('PRAGMA busy_timeout=10000')
  result.submitted = finalDb
    .prepare('SELECT workflow_status FROM local_purchase_orders WHERE id=?')
    .get(result.currency.order_id)
  finalDb.close()
  result.submitText = await page.locator('body').innerText()
  if (
    result.submitted.workflow_status !== 'draft' ||
    !result.submitText.includes('所选报价已失效或不可用')
  )
    throw Error('stale submission was not rejected or draft lost')
  result.checks.push('stale submission rejected, draft preserved')
  await page.screenshot({ path: root + '\\.qa-pr18\\recheck-submitted.png' })
} catch (e) {
  result.errors.push(String(e))
  process.exitCode = 1
} finally {
  writeFileSync(
    `${root}\\.qa-pr18\\recheck-result.json`,
    JSON.stringify(result, null, 2),
  )
  if (browser) await browser.close()
  child.kill()
}
