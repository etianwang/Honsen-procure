// Focused QA driver: real WebView IPC and real HTTPS server, no mock transport.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'
import { Pool } from 'pg'

const {
  T04_EXE: exe,
  T04_PROFILE_A: profileA,
  T04_PROFILE_B: profileB,
  T04_RESULT: resultPath,
  HONSEN_PROCURE_TEST_DATABASE_URL: databaseUrl,
} = process.env
assert.ok(exe && profileA && profileB && resultPath && databaseUrl)
assert.notEqual(profileA, profileB)
assert.ok(new URL(databaseUrl).pathname.includes('test'))
const pool = new Pool({ connectionString: databaseUrl })
const children = []
const browsers = []
const errors = []
const evidence = {
  candidate: process.env.T04_CANDIDATE_SHA,
  steps: {},
}
const categoryId = randomUUID()
const legacyId = randomUUID()
const materialId = randomUUID()
const accountB = '10000000-0000-4000-8000-000000000012'
const accountA = '10000000-0000-4000-8000-000000000013'

async function ready(url) {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(url)).ok
        } catch {
          return false
        }
      },
      { timeout: 30000 },
    )
    .toBe(true)
}
async function launch(profile, port) {
  const child = spawn(exe, [], {
    windowsHide: true,
    env: {
      ...process.env,
      HONSEN_PROCURE_TEST_DB_PATH: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
      WEBVIEW2_USER_DATA_FOLDER: `${profile}.webview`,
    },
  })
  children.push(child)
  await ready(`http://127.0.0.1:${port}/json/version`)
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  browsers.push(browser)
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  const page = browser.contexts()[0].pages()[0]
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() => page.evaluate(() => typeof window.__TAURI__?.core?.invoke), {
      timeout: 30000,
    })
    .toBe('function')
  return page
}
async function invoke(page, command, args) {
  return page.evaluate(
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
}
async function call(page, command, args) {
  const result = await invoke(page, command, args)
  assert.equal(result.ok, true, `${command}: ${JSON.stringify(result.error)}`)
  return result.value
}
function answer(question) {
  const match = /^(\d+) \+ (\d+) = \?$/.exec(question)
  assert.ok(match)
  return Number(match[1]) + Number(match[2])
}
async function login(page, username, password) {
  const local = await call(page, 'issue_local_captcha')
  const cloud = await call(page, 'issue_cloud_captcha')
  return call(page, 'online_login', {
    request: {
      username,
      password,
      localCaptchaId: local.id,
      localCaptchaAnswer: answer(local.question),
      cloudCaptchaId: cloud.id,
      cloudCaptchaAnswer: String(answer(cloud.question)),
    },
  })
}
function rows(path, sql, ...params) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return db
      .prepare(sql)
      .all(...params)
      .map((row) => ({ ...row }))
  } finally {
    db.close()
  }
}
const category = (name, active, version, id = categoryId) => ({
  kind: 'material_category',
  id,
  business_code: `T04-${id}`,
  name,
  is_active: active,
  version,
})

try {
  await pool.query(
    "INSERT INTO user_roles (user_id, role) VALUES ($1, 'administrator') ON CONFLICT DO NOTHING",
    [accountB],
  )
  await pool.query(
    'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [accountB, '10000000-0000-4000-8000-000000000002'],
  )
  await pool.query(
    'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
    [
      accountB,
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
    ],
  )
  const a = await launch(profileA, 9235)
  const b = await launch(profileB, 9236)
  await login(a, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  await login(b, 'engineer-b', process.env.HONSEN_TEST_ENGINEER_B_PASSWORD)
  // Seed a legacy duplicate in this disposable database only; no production data is touched.
  const legacyFirst = randomUUID(),
    legacyDuplicate = randomUUID(),
    legacyMaterial = randomUUID()
  const duplicateCode = `DUP-${randomUUID()}`
  const legacyCategory = (id) => ({
    id,
    businessCode: duplicateCode,
    name: 'Legacy duplicate',
    isActive: true,
    version: 1,
  })
  const legacyMaterialPayload = {
    id: legacyMaterial,
    sku: null,
    categoryId: legacyDuplicate,
    nameZh: 'Legacy material',
    nameFr: null,
    aliases: [],
    brand: null,
    model: 'fixture',
    specification: 'fixture',
    unit: 'piece',
    notes: null,
    isActive: true,
    version: 1,
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL session_replication_role = 'replica'")
    for (const id of [legacyFirst, legacyDuplicate]) {
      const payload = legacyCategory(id)
      await client.query(
        "INSERT INTO sync_entities (entity_type, entity_id, version, payload_json, updated_by) VALUES ('material_category',$1,1,$2,$3)",
        [id, payload, accountA],
      )
      await client.query(
        "INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id) VALUES ('material_category',$1,'upsert',1,$2,$3)",
        [id, payload, accountA],
      )
    }
    await client.query(
      "INSERT INTO sync_entities (entity_type, entity_id, version, payload_json, updated_by) VALUES ('material',$1,1,$2,$3)",
      [legacyMaterial, legacyMaterialPayload, accountA],
    )
    await client.query(
      "INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id) VALUES ('material',$1,'upsert',1,$2,$3)",
      [legacyMaterial, legacyMaterialPayload, accountA],
    )
    await client.query(
      'INSERT INTO category_code_quarantine (entity_id,business_code) VALUES ($1,$3),($2,$3)',
      [legacyFirst, legacyDuplicate, duplicateCode],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  evidence.steps.legacyPull = await call(b, 'pull_sync')
  const held = rows(
    profileB,
    'SELECT entity_type, entity_id, reason FROM local_sync_projection_quarantine WHERE entity_id IN (?, ?, ?)',
    legacyFirst,
    legacyDuplicate,
    legacyMaterial,
  )
  assert.equal(held.length, 3)
  assert.equal(
    rows(
      profileB,
      'SELECT last_pull_cursor FROM local_sync_account_pull_state WHERE account_id = ?',
      accountB,
    )[0].last_pull_cursor !== '0',
    true,
  )
  const beforeReplay = rows(
    profileB,
    'SELECT entity_type, entity_id, payload_json FROM local_sync_remote_entities WHERE entity_id IN (?, ?, ?) ORDER BY entity_id',
    legacyFirst,
    legacyDuplicate,
    legacyMaterial,
  )
  assert.equal(beforeReplay.length, 3)
  const replay = await call(b, 'pull_sync')
  assert.equal(replay.appliedCount, 0)
  assert.equal(replay.nextCursor, evidence.steps.legacyPull.nextCursor)
  assert.deepEqual(
    rows(
      profileB,
      'SELECT entity_type, entity_id, payload_json FROM local_sync_remote_entities WHERE entity_id IN (?, ?, ?) ORDER BY entity_id',
      legacyFirst,
      legacyDuplicate,
      legacyMaterial,
    ),
    beforeReplay,
  )
  assert.equal(
    rows(
      profileB,
      'SELECT count(*) AS n FROM local_sync_projection_quarantine WHERE entity_id IN (?, ?, ?)',
      legacyFirst,
      legacyDuplicate,
      legacyMaterial,
    )[0].n,
    3,
  )
  evidence.steps.quarantinedReplay = 'unchanged cursor, records and quarantine'
  const remoteIssues = await call(a, 'list_remote_category_quarantine')
  assert.ok(remoteIssues.some((item) => item.categoryId === legacyDuplicate))
  const repairedCode = `FIX-${randomUUID()}`
  await call(a, 'repair_remote_category', {
    input: {
      categoryId: legacyDuplicate,
      expectedVersion: 1,
      newBusinessCode: repairedCode,
      reason: 'synthetic duplicate repair',
    },
  })
  await call(b, 'pull_sync')
  assert.equal(
    rows(
      profileB,
      'SELECT COUNT(*) AS n FROM local_sync_projection_quarantine WHERE entity_id IN (?, ?, ?)',
      legacyFirst,
      legacyDuplicate,
      legacyMaterial,
    )[0].n,
    0,
  )
  assert.equal(
    rows(
      profileB,
      'SELECT category_id FROM local_materials WHERE id = ?',
      legacyMaterial,
    )[0].category_id,
    legacyDuplicate,
  )
  assert.equal(
    rows(
      profileB,
      'SELECT business_code FROM local_material_categories WHERE id = ?',
      legacyDuplicate,
    )[0].business_code,
    repairedCode,
  )
  evidence.steps.legacyRecovery = {
    held,
    repairedCode,
    materialId: legacyMaterial,
    categoryId: legacyDuplicate,
  }

  // Distinct offline UUIDs collide; retain the old rejected event and send a linked replacement.
  const localA = randomUUID(),
    localB = randomUUID(),
    raceCode = `RACE-${randomUUID()}`
  const localRecord = (id) => ({
    kind: 'material_category',
    id,
    business_code: raceCode,
    name: 'Local duplicate',
    is_active: true,
    version: 1,
  })
  await call(a, 'save_reference_master_data', { record: localRecord(localA) })
  await call(b, 'save_reference_master_data', { record: localRecord(localB) })
  await call(a, 'push_pending_sync')
  await call(b, 'push_pending_sync')
  const localIssues = await call(b, 'list_local_category_conflicts')
  const localIssue = localIssues.find((item) => item.categoryId === localB)
  assert.ok(localIssue)
  const independent = randomUUID()
  await call(b, 'save_reference_master_data', {
    record: {
      ...localRecord(independent),
      business_code: `OTHER-${independent}`,
    },
  })
  const independentPush = await call(b, 'push_pending_sync')
  assert.equal(independentPush.acceptedCount, 1)
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM sync_entities WHERE entity_type='material_category' AND entity_id=$1",
        [independent],
      )
    ).rows[0].n,
    1,
  )
  evidence.steps.unrelatedPushWhileHeld = 'accepted'
  const replacementCode = `FIX-${randomUUID()}`
  const replacementEvent = await call(b, 'repair_local_category_conflict', {
    eventId: localIssue.eventId,
    newBusinessCode: replacementCode,
    reason: 'offline duplicate',
  })
  assert.notEqual(replacementEvent, localIssue.eventId)
  await call(b, 'push_pending_sync')
  await call(a, 'pull_sync')
  await call(b, 'pull_sync')
  assert.equal(
    rows(
      profileA,
      'SELECT business_code FROM local_material_categories WHERE id = ?',
      localB,
    )[0].business_code,
    replacementCode,
  )
  assert.equal(
    rows(
      profileB,
      'SELECT business_code FROM local_material_categories WHERE id = ?',
      localB,
    )[0].business_code,
    replacementCode,
  )
  const originalEvent = rows(
    profileB,
    'SELECT acknowledged_at, superseded_at, last_error FROM local_sync_outbox WHERE event_id = ?',
    localIssue.eventId,
  )[0]
  assert.equal(originalEvent.acknowledged_at, null)
  assert.equal(originalEvent.superseded_at, null)
  assert.equal(originalEvent.last_error, 'CATEGORY_CODE_CONFLICT')
  evidence.steps.localRecovery = {
    oldEvent: localIssue.eventId,
    replacementEvent,
    replacementCode,
  }
  await call(a, 'save_reference_master_data', {
    record: category('Fixture', true, 1),
  })
  evidence.steps.outbox = rows(
    profileA,
    'SELECT event_id, payload_json, acknowledged_at FROM local_sync_outbox WHERE entity_id = ?',
    categoryId,
  )
  assert.equal(evidence.steps.outbox.length, 1)
  assert.equal(evidence.steps.outbox[0].acknowledged_at, null)
  evidence.steps.pushCreate = await call(a, 'push_pending_sync')
  assert.equal(evidence.steps.pushCreate.acceptedCount, 1)
  evidence.steps.serverCreate = (
    await pool.query(
      'SELECT payload_json, version FROM sync_entities WHERE entity_id=$1',
      [categoryId],
    )
  ).rows
  assert.equal(
    evidence.steps.serverCreate[0].payload_json.businessCode,
    `T04-${categoryId}`,
  )
  evidence.steps.pullCreate = await call(b, 'pull_sync')
  let bCategory = rows(
    profileB,
    'SELECT id, business_code, name, is_active, version FROM local_material_categories WHERE id=?',
    categoryId,
  )
  assert.equal(bCategory.length, 1)
  assert.equal(bCategory[0].name, 'Fixture')
  const material = {
    id: materialId,
    sku: null,
    categoryId,
    nameZh: 'Synthetic fixture',
    nameFr: null,
    aliases: [],
    brand: null,
    model: 'T04',
    specification: 'fixture',
    unit: 'piece',
    notes: null,
    isActive: true,
    version: 1,
  }
  await call(b, 'save_material', { material })
  await call(a, 'save_reference_master_data', {
    record: category('Revised', false, 2),
  })
  evidence.steps.pushUpdate = await call(a, 'push_pending_sync')
  assert.equal(evidence.steps.pushUpdate.acceptedCount, 1)
  evidence.steps.pullUpdate = await call(b, 'pull_sync')
  bCategory = rows(
    profileB,
    'SELECT id, business_code, name, is_active, version FROM local_material_categories WHERE id=?',
    categoryId,
  )
  assert.equal(bCategory.length, 1)
  assert.equal(bCategory[0].name, 'Revised')
  assert.equal(bCategory[0].is_active, 0)
  assert.equal(
    rows(
      profileB,
      'SELECT category_id FROM local_materials WHERE id=?',
      materialId,
    )[0].category_id,
    categoryId,
  )
  evidence.steps.pullRepeat = await call(b, 'pull_sync')
  evidence.steps.pushRepeat = await call(a, 'push_pending_sync')
  assert.equal(evidence.steps.pushRepeat.acceptedCount, 0)
  assert.equal(
    rows(
      profileB,
      'SELECT id FROM local_material_categories WHERE id=?',
      categoryId,
    ).length,
    1,
  )
  const legacy = {
    id: legacyId,
    business_code: `T04-${legacyId}`,
    name: 'Legacy',
    is_active: true,
    version: 1,
  }
  await pool.query(
    "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES ('material_category',$1,'upsert',1,$2,$3)",
    [legacyId, legacy, accountA],
  )
  evidence.steps.pullLegacy = await call(b, 'pull_sync')
  assert.equal(
    rows(
      profileB,
      'SELECT name FROM local_material_categories WHERE id=?',
      legacyId,
    )[0].name,
    'Legacy',
  )
  evidence.steps.cursor = rows(
    profileB,
    'SELECT last_pull_cursor FROM local_sync_account_pull_state WHERE account_id=?',
    accountB,
  )
  assert.notEqual(evidence.steps.cursor[0].last_pull_cursor, '0')
  await call(b, 'lock_session')
  await login(b, 'engineer-a', process.env.HONSEN_TEST_ENGINEER_A_PASSWORD)
  evidence.steps.denied = await invoke(b, 'save_reference_master_data', {
    record: category('Unauthorized', true, 1, randomUUID()),
  })
  assert.equal(evidence.steps.denied.ok, false)
  assert.equal(errors.length, 0, JSON.stringify(errors))
  // Independent additions: ordinary-user recovery denial and real recovery UI.
  await login(b, 'engineer-a', process.env.HONSEN_TEST_ENGINEER_A_PASSWORD)
  for (const [command, args] of [
    ['list_remote_category_quarantine', undefined],
    ['list_local_category_conflicts', undefined],
    [
      'repair_local_category_conflict',
      {
        eventId: randomUUID(),
        newBusinessCode: 'DENIED',
        reason: 'permission check',
      },
    ],
    [
      'repair_remote_category',
      {
        input: {
          categoryId: randomUUID(),
          expectedVersion: 1,
          newBusinessCode: 'DENIED',
          reason: 'permission check',
        },
      },
    ],
  ]) {
    const denial = await invoke(b, command, args)
    assert.equal(denial.ok, false, `${command} unexpectedly allowed`)
    assert.equal(
      denial.error.code,
      'forbidden',
      `${command}: ${JSON.stringify(denial.error)}`,
    )
  }
  evidence.steps.recoveryPermission =
    'ordinary user denied all four recovery IPCs'
  const uiFirst = randomUUID(),
    uiSecond = randomUUID(),
    uiCode = `UI-${randomUUID()}`
  const uiClient = await pool.connect()
  try {
    await uiClient.query('BEGIN')
    await uiClient.query("SET LOCAL session_replication_role = 'replica'")
    for (const id of [uiFirst, uiSecond]) {
      const payload = {
        id,
        businessCode: uiCode,
        name: 'UI fixture',
        isActive: true,
        version: 1,
      }
      await uiClient.query(
        "INSERT INTO sync_entities (entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_category',$1,1,$2,$3)",
        [id, payload, accountA],
      )
      await uiClient.query(
        'INSERT INTO category_code_quarantine(entity_id,business_code) VALUES ($1,$2)',
        [id, uiCode],
      )
    }
    await uiClient.query('COMMIT')
  } catch (error) {
    await uiClient.query('ROLLBACK')
    throw error
  } finally {
    uiClient.release()
  }
  await a.locator('#account').fill('purchaser')
  await a.locator('#password').fill(process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  await a.getByRole('button', { name: '获取验证码' }).click()
  await expect(a.locator('label[for="cloud-captcha"]')).toBeVisible()
  const localQuestion = (
    await a.locator('label[for="captcha"]').innerText()
  ).split('：')[1]
  const cloudQuestion = (
    await a.locator('label[for="cloud-captcha"]').innerText()
  ).split('：')[1]
  await a.locator('#captcha').fill(String(answer(localQuestion)))
  await a.locator('#cloud-captcha').fill(String(answer(cloudQuestion)))
  await a.getByRole('button', { name: '在线登录' }).click()
  await a.getByRole('button', { name: '同步冲突' }).click({ timeout: 30000 })
  const panel = a.getByRole('region', { name: '分类编码冲突' })
  const article = panel.locator('article').filter({ hasText: uiSecond })
  await expect(article).toBeVisible({ timeout: 30000 })
  const uiReplacement = `UIFIX-${randomUUID()}`
  await panel.getByLabel('分类新编码').fill(uiReplacement)
  await panel.getByLabel('分类修复原因').fill('independent UI verification')
  writeFileSync(process.env.T04_DROP_FLAG, 'drop response after commit')
  await article.getByRole('button', { name: '修复云端分类' }).click()
  await expect(panel.getByRole('status')).toContainText('修复未完成', {
    timeout: 30000,
  })
  const pending = panel
    .locator('article')
    .filter({ hasText: uiSecond })
    .filter({ hasText: '待确认的云端修复' })
  await expect(pending).toBeVisible({ timeout: 30000 })
  await pending.getByRole('button', { name: '重试待确认修复' }).click()
  await expect(panel.getByRole('status')).toContainText('云端修复已确认', {
    timeout: 30000,
  })
  const uiResult = await pool.query(
    "SELECT payload_json->>'businessCode' AS code FROM sync_entities WHERE entity_type='material_category' AND entity_id=$1",
    [uiSecond],
  )
  assert.equal(uiResult.rows[0].code, uiReplacement)
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_entries WHERE entity_id=$1 AND action='repair_business_code'",
        [uiSecond],
      )
    ).rows[0].n,
    1,
  )
  evidence.steps.realUiRepair = {
    categoryId: uiSecond,
    replacementCode: uiReplacement,
    responseLostAndRetried: true,
  }
  evidence.result = 'PASS'
} catch (error) {
  evidence.result = 'INCOMPLETE'
  evidence.error = String(error)
  throw error
} finally {
  writeFileSync(resultPath, JSON.stringify(evidence, null, 2))
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children.reverse())
    if (child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  await pool.end()
}
