import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
const root = process.cwd(),
  dbPath = `${root}\\.qa-pr18\\quotes.test.sqlite`,
  country = '60000000-0000-4000-8000-000000000001',
  project = '60000000-0000-4000-8000-000000000002',
  supplier = '60000000-0000-4000-8000-000000000003',
  price = '60000000-0000-4000-8000-000000000004',
  material = '10000000-0000-4000-8000-000000000005',
  authorized = '10000000-0000-4000-8000-000000000002'
const db = new DatabaseSync(dbPath)
db.exec('PRAGMA busy_timeout=10000')
db.prepare(
  "INSERT OR IGNORE INTO local_countries (id,business_code,name,time_zone,is_active,version) VALUES (?,'QA-FOREIGN','foreign','UTC',1,1)",
).run(country)
db.prepare(
  "INSERT OR IGNORE INTO local_projects (id,country_id,business_code,name,site,department_name,default_currency,default_language_pair,is_active,version) VALUES (?,?,'QA-FOREIGN-P','foreign','site','dept','XOF','zh_fr',1,1)",
).run(project, country)
db.prepare(
  "INSERT OR IGNORE INTO local_suppliers (id,business_code,name,country_id,is_active,is_blacklisted,is_preferred,version) VALUES (?,'QA-FOREIGN-S','foreign supplier',?,1,0,0,1)",
).run(supplier, country)
db.prepare(
  "INSERT OR IGNORE INTO local_material_prices (id,material_id,supplier_id,currency,unit_price_minor,unit,effective_at,is_active,version) VALUES (?,?,?,'XOF',1,'米','2026-10-12',1,1)",
).run(price, material, supplier)
db.close()
const env = {
  ...process.env,
  HONSEN_PROCURE_PROFILE: 'test',
  HONSEN_PROCURE_TEST_DB_PATH: dbPath,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
    '--remote-debugging-port=19257 --remote-debugging-address=127.0.0.1',
  WEBVIEW2_USER_DATA_FOLDER: `${root}\\.qa-pr18\\country-webview`,
}
const child = spawn(
  `${root}\\.qa-pr18\\cargo-target\\debug\\HonsenProcure.exe`,
  [],
  { env, windowsHide: true },
)
const result = {
  sha: 'f805c9ed3c88f6af16238e999539fd591f7d93b4',
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
  const call = (projectId) =>
    page.evaluate(
      async ({ material, projectId }) => {
        try {
          return {
            ok: true,
            value: await window.__TAURI__.core.invoke('list_catalog_prices', {
              materialId: material,
              projectId,
              after: null,
              includeBlacklisted: true,
            }),
          }
        } catch (error) {
          return { ok: false, error }
        }
      },
      { material, projectId },
    )
  result.authorized = await call(authorized)
  result.foreign = await call(project)
  if (
    !result.authorized.ok ||
    result.authorized.value.some((x) => x.priceId === price) ||
    !result.foreign.ok ||
    result.foreign.value.length
  )
    throw Error('foreign quote visible')
  result.checks.push(
    'new paginated IPC does not disclose foreign supplier or quote for authorized or foreign project',
  )
} catch (e) {
  result.errors.push(String(e))
  process.exitCode = 1
} finally {
  writeFileSync(
    `${root}\\.qa-pr18\\country-result.json`,
    JSON.stringify(result, null, 2),
  )
  if (browser) await browser.close()
  child.kill()
}
