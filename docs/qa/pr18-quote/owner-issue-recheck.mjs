import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
const root = process.cwd(),
  dbPath = `${root}\\.qa-pr18\\quotes.test.sqlite`,
  orderId = randomUUID(),
  itemId = randomUUID(),
  priceId = '40000000-0000-4000-8000-000000000003'
const env = {
  ...process.env,
  HONSEN_PROCURE_PROFILE: 'test',
  HONSEN_PROCURE_TEST_DB_PATH: dbPath,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
    '--remote-debugging-port=19257 --remote-debugging-address=127.0.0.1',
  WEBVIEW2_USER_DATA_FOLDER: `${root}\\.qa-pr18\\snapshot-webview`,
}
const child = spawn(
  `${root}\\.qa-pr18\\cargo-target\\debug\\HonsenProcure.exe`,
  [],
  { env, windowsHide: true },
)
const result = {
  sha:
    process.env.QA_CANDIDATE_SHA || 'c00129745572ab8e80d8ef42aca1cba79aefc37e',
  orderId,
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
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA busy_timeout=10000')
  db.prepare(
    'UPDATE local_material_prices SET unit_price_minor=1003, is_active=1 WHERE id=?',
  ).run(priceId)
  const account = db
    .prepare("SELECT id FROM local_accounts WHERE username='purchaser'")
    .get().id
  db.prepare(
    "INSERT INTO local_purchase_orders (id,display_no,country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,workflow_status,urgency,order_date,delivery_address,subtotal_minor,line_discount_minor,order_discount_minor,freight_minor,tax_rate_basis_points,tax_minor,total_minor,version,created_at,updated_at) VALUES (?,?,'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Test site','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004',?,'XOF','XOF','zh_fr','pending_confirmation','confirmed','normal','2026-10-12','test',1003,0,0,0,0,0,1003,1,0,0)",
  ).run(orderId, `QA-${orderId}`, account)
  db.prepare(
    "INSERT INTO local_purchase_order_items (id,order_id,material_id,material_snapshot_json,currency,quantity_decimal,unit,unit_price_minor,line_total_minor,sort_order,created_at,updated_at) VALUES (?,?,'10000000-0000-4000-8000-000000000005','{\"nameZh\":\"synthetic\"}','XOF','1','米',1003,1003,0,0,0)",
  ).run(itemId, orderId)
  db.close()
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
  result.pricing = await call('save_owner_purchase_pricing', {
    input: {
      orderId,
      lines: [
        {
          orderItemId: itemId,
          quoteSource: { kind: 'catalog_price', material_price_id: priceId },
          lockedExchangeRateDecimal: '1',
          markup: { kind: 'fixed_minor', minor: '0' },
        },
      ],
      revisionReason: null,
    },
  })
  if (!result.pricing.ok) throw Error('pricing failed')
  const inspect = () => {
    const conn = new DatabaseSync(dbPath, { readOnly: true })
    conn.exec('PRAGMA busy_timeout=10000')
    const value = {
      order: conn
        .prepare(
          'SELECT workflow_status, formal_document_no, total_minor, formal_snapshot_json FROM local_purchase_orders WHERE id=?',
        )
        .get(orderId),
      line: conn
        .prepare(
          'SELECT owner_quote_source,owner_catalog_price_id,owner_source_unit_price_minor,owner_final_unit_price_minor,line_total_minor FROM local_purchase_order_items WHERE id=?',
        )
        .get(itemId),
      sequence: conn
        .prepare(
          'SELECT next_formal_sequence FROM local_sync_state WHERE singleton=1',
        )
        .get(),
      outbox: conn
        .prepare(
          'SELECT count(*) AS count FROM local_sync_outbox WHERE entity_id=?',
        )
        .get(orderId),
    }
    conn.close()
    return value
  }
  const baseline = inspect()
  result.baseline = baseline
  for (const [name, sql, restore, id] of [
    [
      'inactive',
      'UPDATE local_material_prices SET is_active=0 WHERE id=?',
      'UPDATE local_material_prices SET is_active=1 WHERE id=?',
      priceId,
    ],
    [
      'blacklisted',
      'UPDATE local_suppliers SET is_blacklisted=1 WHERE id=?',
      'UPDATE local_suppliers SET is_blacklisted=0 WHERE id=?',
      '30000000-0000-4000-8000-000000000003',
    ],
  ]) {
    let conn = new DatabaseSync(dbPath)
    conn.exec('PRAGMA busy_timeout=10000')
    conn.prepare(sql).run(id)
    conn.close()
    const attempt = await call('issue_owner_formal_order', { orderId })
    const after = inspect()
    result[name] = { attempt, after }
    if (
      attempt.ok ||
      !JSON.stringify(attempt.error).includes('quote_unavailable')
    )
      throw Error(`${name} was not rejected with quote_unavailable`)
    if (JSON.stringify(baseline) !== JSON.stringify(after))
      throw Error(`${name} changed order, price, sequence or outbox`)
    conn = new DatabaseSync(dbPath)
    conn.exec('PRAGMA busy_timeout=10000')
    conn.prepare(restore).run(id)
    conn.close()
    result.checks.push(
      `${name} rejected, order and sequence and outbox unchanged`,
    )
  }
  result.issue = await call('issue_owner_formal_order', { orderId })
  if (!result.issue.ok) throw Error('formal issue failed')
  const verify = new DatabaseSync(dbPath)
  verify.exec('PRAGMA busy_timeout=10000')
  const before = verify
    .prepare(
      'SELECT formal_snapshot_json,total_minor FROM local_purchase_orders WHERE id=?',
    )
    .get(orderId)
  verify
    .prepare('UPDATE local_material_prices SET unit_price_minor=7 WHERE id=?')
    .run(priceId)
  const after = verify
    .prepare(
      'SELECT formal_snapshot_json,total_minor FROM local_purchase_orders WHERE id=?',
    )
    .get(orderId)
  verify.close()
  result.before = before
  result.after = after
  if (
    before.total_minor !== 1003 ||
    JSON.stringify(before) !== JSON.stringify(after)
  )
    throw Error('snapshot changed')
  result.checks.push(
    'real IPC formal issue frozen snapshot and total survive later price change; order pre-approved by SQLite fixture',
  )
  const manualOrder = randomUUID(),
    manualItem = randomUUID()
  const manualDb = new DatabaseSync(dbPath)
  manualDb.exec('PRAGMA busy_timeout=10000')
  manualDb
    .prepare(
      "INSERT INTO local_purchase_orders (id,display_no,country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,workflow_status,urgency,order_date,delivery_address,subtotal_minor,line_discount_minor,order_discount_minor,freight_minor,tax_rate_basis_points,tax_minor,total_minor,version,created_at,updated_at) VALUES (?,?,'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Test site','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004',?,'XOF','XOF','zh_fr','pending_confirmation','confirmed','normal','2026-10-12','test',100,0,0,0,0,0,100,1,0,0)",
    )
    .run(manualOrder, `QA-${manualOrder}`, account)
  manualDb
    .prepare(
      "INSERT INTO local_purchase_order_items (id,order_id,material_id,material_snapshot_json,currency,quantity_decimal,unit,unit_price_minor,line_total_minor,sort_order,created_at,updated_at) VALUES (?,?,'10000000-0000-4000-8000-000000000005','{\"nameZh\":\"synthetic\"}','XOF','1','米',100,100,0,0,0)",
    )
    .run(manualItem, manualOrder)
  manualDb
    .prepare('UPDATE local_material_prices SET is_active=0 WHERE id=?')
    .run(priceId)
  manualDb.close()
  result.manualPricing = await call('save_owner_purchase_pricing', {
    input: {
      orderId: manualOrder,
      lines: [
        {
          orderItemId: manualItem,
          quoteSource: {
            kind: 'manual_reference',
            unit_price_minor: '100',
            reason: 'synthetic manual reference',
          },
          lockedExchangeRateDecimal: '1',
          markup: { kind: 'fixed_minor', minor: '0' },
        },
      ],
      revisionReason: null,
    },
  })
  if (!result.manualPricing.ok) throw Error('manual pricing failed')
  result.manualIssue = await call('issue_owner_formal_order', {
    orderId: manualOrder,
  })
  if (!result.manualIssue.ok) throw Error('manual issue failed')
  result.checks.push(
    'manual-only issue succeeds while catalog quote is inactive',
  )
} catch (e) {
  result.errors.push(String(e))
  process.exitCode = 1
} finally {
  writeFileSync(
    `${root}\\.qa-pr18\\owner-issue-recheck-result.json`,
    JSON.stringify(result, null, 2),
  )
  if (browser) await browser.close()
  child.kill()
}
