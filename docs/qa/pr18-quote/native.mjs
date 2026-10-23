import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'

const root = process.cwd(),
  dbPath = `${root}\\.qa-pr18\\quotes.test.sqlite`
const db = new DatabaseSync(dbPath)
const material = '10000000-0000-4000-8000-000000000005',
  country = '10000000-0000-4000-8000-000000000001'
for (let i = 1; i <= 32; i++) {
  const sid = `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  const pid = `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  db.prepare(
    'INSERT OR IGNORE INTO local_suppliers (id,business_code,name,country_id,is_active,is_blacklisted,is_preferred,version) VALUES (?,?,?,?,1,0,0,1)',
  ).run(sid, `QA-${i}`, `QA Vendor ${i}`, country)
  db.prepare(
    "INSERT OR IGNORE INTO local_material_prices (id,material_id,supplier_id,currency,unit_price_minor,unit,effective_at,is_active,version) VALUES (?,?,?,'XOF',?,'米','2026-10-12',1,1)",
  ).run(pid, material, sid, 1000 + i)
}
db.close()
const env = {
  ...process.env,
  HONSEN_PROCURE_PROFILE: 'test',
  HONSEN_PROCURE_TEST_DB_PATH: dbPath,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
    '--remote-debugging-port=19257 --remote-debugging-address=127.0.0.1',
  WEBVIEW2_USER_DATA_FOLDER: `${root}\\.qa-pr18\\webview`,
}
const child = spawn(
  `${root}\\.qa-pr18\\cargo-target\\debug\\HonsenProcure.exe`,
  [],
  { env, windowsHide: true },
)
const result = {
  testedSha: 'f805c9ed3c88f6af16238e999539fd591f7d93b4',
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
  await expect(page.locator('label[for=captcha]')).toContainText('= ?')
  const match = /(\d+) \+ (\d+) = \?/.exec(
    await page.locator('label[for=captcha]').textContent(),
  )
  await page
    .locator('#captcha')
    .fill(String(Number(match[1]) + Number(match[2])))
  await page.getByRole('button', { name: '离线登录' }).click()
  await page.getByRole('button', { name: '材料库', exact: true }).click()
  await page.getByRole('button', { name: '查看全部报价' }).click()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText(/QA Vendor 25 ·/)).toBeVisible()
  result.checks.push('native material detail second page displays QA Vendor 25')
  await page.screenshot({ path: `${root}\\.qa-pr18\\detail.png` })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '采购申请单' }).click()
  await page.getByLabel('材料').click()
  await page.getByText('合成测试电缆 · TEST-3X2.5', { exact: true }).click()
  await page.getByRole('button', { name: '加载更多报价' }).click()
  await page.getByLabel('选择供应商报价').click()
  await page.getByText(/QA Vendor 25 ·/).click()
  await expect(page.getByLabel('单价（最小货币单位）')).toHaveValue('1025')
  await page.getByLabel('数量').fill('3')
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('草稿已自动保存到本机')).toBeVisible({
    timeout: 30000,
  })
  const read = new DatabaseSync(dbPath, { readOnly: true })
  result.persisted = read
    .prepare(
      'SELECT supplier_snapshot_json,currency,unit_price_minor,quantity_decimal,line_total_minor FROM local_purchase_order_items ORDER BY rowid DESC LIMIT 1',
    )
    .get()
  read.close()
  result.checks.push(
    'native purchasing selected QA Vendor 25 at 1025 XOF, quantity 3',
  )
  await page.screenshot({ path: `${root}\\.qa-pr18\\order.png` })
} catch (e) {
  result.errors.push(String(e))
  process.exitCode = 1
} finally {
  writeFileSync(
    `${root}\\.qa-pr18\\native-result.json`,
    JSON.stringify(result, null, 2),
  )
  if (browser) await browser.close()
  child.kill()
}
