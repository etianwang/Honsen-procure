// Test-only CDP driver: real debug EXE/WebView IPC, never a substitute sync HTTP client.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { chromium, expect } from '@playwright/test'
import { Pool } from 'pg'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const resultPath = process.env.HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH
const profileA = process.env.HONSEN_PROCURE_TEST_DB_PATH
const profileB = process.env.HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH
assert.equal(process.env.HONSEN_PROCURE_PROFILE, 'test')
for (const path of [profileA, profileB]) {
  assert.ok(path && resolve(path) === path && path.endsWith('.test.sqlite'))
  assert.ok(path.startsWith(join(repo, '.honsen-native-qa') + '\\'))
}
assert.notEqual(profileA, profileB)
assert.ok(resultPath?.startsWith(join(repo, '.honsen-native-qa') + '\\'))
assert.ok(resultPath.endsWith('.test.json'))
const url = new URL(process.env.HONSEN_PROCURE_TEST_DATABASE_URL)
assert.equal(url.hostname, '127.0.0.1')
assert.ok(url.pathname.includes('test'))
const pool = new Pool({ connectionString: url.toString() })
const children = []
const browsers = []
const consoleErrors = []
const denials = []
let revokedSessionAccess = null
const accountA = '10000000-0000-4000-8000-000000000013'
const accountB = '10000000-0000-4000-8000-000000000012'
const sourceA = `G1-local-${randomUUID()}`
const sourceServer = `G1-server-${randomUUID()}`
const material = {
  id: randomUUID(),
  sku: null,
  categoryId: null,
  nameZh: sourceServer,
  nameFr: null,
  aliases: [],
  brand: null,
  model: 'G1-TEST',
  specification: 'Synthetic G1 source',
  unit: 'piece',
  notes: null,
  isActive: true,
  version: 1,
}

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
      { timeout: 30_000 },
    )
    .toBe(true)
}

async function launch(profile, port) {
  const environment = {
    ...globalThis.process.env,
    HONSEN_PROCURE_TEST_DB_PATH: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    WEBVIEW2_USER_DATA_FOLDER: `${profile}.webview`,
  }
  delete environment.HONSEN_PROCURE_NATIVE_SMOKE
  const process = spawn(
    join(repo, 'apps/desktop/src-tauri/target/debug/HonsenProcure.exe'),
    [],
    {
      cwd: repo,
      windowsHide: true,
      env: environment,
    },
  )
  children.push(process)
  await ready(`http://127.0.0.1:${port}/json/version`)
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  browsers.push(browser)
  await expect
    .poll(() => browser.contexts()[0]?.pages().length ?? 0)
    .toBeGreaterThan(0)
  const page = browser.contexts()[0].pages()[0]
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  try {
    await expect(
      page.getByRole('heading', { name: '登录 HONSEN Procure' }),
    ).toBeVisible({ timeout: 30_000 })
  } catch (error) {
    await page.screenshot({ path: `${resultPath}-startup.png` })
    throw new Error(
      `native startup ${page.url()}: ${(await page.locator('body').innerText()).slice(0, 500)}; ${error}`,
    )
  }
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke),
    'function',
  )
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
async function denied(page, command, args, code) {
  const result = await invoke(page, command, args)
  assert.equal(result.ok, false, `${command} unexpectedly allowed`)
  if (code) assert.deepEqual(result.error, { code })
  const serialized = JSON.stringify(result.error)
  assert.ok(!serialized.includes(sourceA) && !serialized.includes(sourceServer))
  denials.push({ command, error: result.error })
}
function answer(question) {
  const match = /^(\d+) \+ (\d+) = \?$/.exec(question)
  assert.ok(match, 'unexpected CAPTCHA')
  return Number(match[1]) + Number(match[2])
}
async function login(page, username, password, pending = 0) {
  await page.getByLabel('账号', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  const local = page.locator('label[for="captcha"]')
  const cloud = page.locator('label[for="cloud-captcha"]')
  await expect(cloud).toHaveText(/云端验证码：\d+ \+ \d+ = \?/u)
  await page
    .locator('#captcha')
    .fill(String(answer((await local.innerText()).split('：')[1])))
  await page
    .locator('#cloud-captcha')
    .fill(String(answer((await cloud.innerText()).split('：')[1])))
  await page.getByRole('button', { name: '在线登录', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toHaveCount(0)
  await expect
    .poll(async () => (await call(page, 'sync_status')).pendingCount)
    .toBe(pending)
}
async function lock(page) {
  await page.getByRole('button', { name: /锁定/u }).click()
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible()
}
async function loginCore(page, username, password) {
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

try {
  // Only initial synthetic account fixture setup; no SQLite/conflict/event writes.
  await pool.query(
    "INSERT INTO user_roles (user_id, role) VALUES ($1, 'administrator') ON CONFLICT DO NOTHING",
    [accountB],
  )
  const vite = spawn(
    globalThis.process.execPath,
    [
      join(repo, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '1420',
      '--strictPort',
    ],
    {
      cwd: join(repo, 'apps/desktop'),
      windowsHide: true,
      stdio: 'ignore',
    },
  )
  children.push(vite)
  await ready('http://127.0.0.1:1420')
  const producer = await launch(profileB, 9235)
  await login(
    producer,
    'engineer-b',
    process.env.HONSEN_TEST_ENGINEER_B_PASSWORD,
  )
  await call(producer, 'save_material', { material })
  assert.equal((await call(producer, 'push_pending_sync')).acceptedCount, 1)
  await lock(producer)
  const page = await launch(profileA, 9236)
  // Keep the renderer logged out during setup so automatic Pull cannot replace the deliberate stale baseline.
  await loginCore(page, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  await call(page, 'save_material', {
    material: { ...material, nameZh: sourceA },
  })
  assert.equal((await call(page, 'push_pending_sync')).pendingCount, 1)
  await call(page, 'pull_sync')
  const own = await call(page, 'list_sync_conflicts')
  assert.equal(own.length, 1)
  assert.ok(own[0].localPayloadJson.includes(sourceA))
  assert.ok(own[0].serverPayloadJson.includes(sourceServer))
  const input = {
    conflictId: own[0].id,
    resolution: 'keep_local',
    reason: 'G1 independent owner resolution',
  }
  await login(page, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD, 1)
  await lock(page)
  await denied(
    page,
    'list_sync_conflicts',
    undefined,
    'reauthentication_required',
  )
  await denied(
    page,
    'resolve_sync_conflict',
    { input },
    'reauthentication_required',
  )
  await login(page, 'engineer-b', process.env.HONSEN_TEST_ENGINEER_B_PASSWORD)
  assert.deepEqual(await call(page, 'list_sync_conflicts'), [])
  const forged = {
    accountId: accountA,
    deviceId: randomUUID(),
    installationId: randomUUID(),
    conflictId: own[0].id,
  }
  assert.deepEqual(await call(page, 'list_sync_conflicts', forged), [])
  for (const resolution of ['keep_local', 'use_server']) {
    await denied(
      page,
      'resolve_sync_conflict',
      { input: { ...input, resolution } },
      'sync_account_boundary',
    )
  }
  await denied(
    page,
    'resolve_sync_conflict',
    { input: { ...input, conflictId: randomUUID() } },
    'sync_account_boundary',
  )
  for (const field of ['accountId', 'deviceId', 'installationId']) {
    await denied(page, 'resolve_sync_conflict', {
      input: { ...input, [field]: forged[field] },
    })
  }
  await call(page, 'save_material', {
    material: {
      ...material,
      id: randomUUID(),
      nameZh: 'G1 legitimate B event',
    },
  })
  assert.equal((await call(page, 'push_pending_sync', forged)).acceptedCount, 1)
  await denied(page, 'pull_sync', forged, 'sync_account_boundary')
  const bodyB = await page.locator('body').innerText()
  assert.ok(!bodyB.includes(sourceA) && !bodyB.includes(sourceServer))
  await page.screenshot({ path: `${resultPath}-B.png` })
  await lock(page)
  await login(page, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD, 1)
  assert.deepEqual(await call(page, 'list_sync_conflicts'), own)
  // Real second login revokes A's old token; no direct session/conflict-table mutation.
  await login(producer, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  await denied(page, 'pull_sync', undefined, 'reauthentication_required')
  const revokedRead = await invoke(page, 'list_sync_conflicts')
  revokedSessionAccess = {
    denied: !revokedRead.ok,
    code: revokedRead.error?.code,
    conflictCount: revokedRead.value?.length ?? null,
    sourceDisclosed:
      revokedRead.value?.some((item) =>
        item.localPayloadJson.includes(sourceA),
      ) ?? false,
  }
  await lock(producer)
  await lock(page)
  await login(page, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD, 1)
  await call(page, 'resolve_sync_conflict', { input })
  assert.equal((await call(page, 'push_pending_sync')).acceptedCount, 1)
  assert.deepEqual(await call(page, 'list_sync_conflicts'), [])
  const db = new DatabaseSync(profileA, { readOnly: true })
  const audit = db
    .prepare(
      'SELECT resolved_by, resolution_reason FROM local_sync_conflicts WHERE id = ? AND resolved_at IS NOT NULL',
    )
    .get(own[0].id)
  assert.equal(audit.resolved_by, accountA)
  assert.equal(audit.resolution_reason, input.reason)
  db.close()
  const origins = (
    await pool.query(
      'SELECT origin_account_id, origin_installation_id, server_version FROM sync_events ORDER BY created_at',
    )
  ).rows
  assert.ok(
    origins.some(
      (row) => row.origin_account_id === accountA && row.server_version === '2',
    ),
  )
  const diagnostics = readFileSync(
    process.env.HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH,
    'utf8',
  )
  assert.ok(
    diagnostics.includes('validation_error') ||
      diagnostics.includes('conflict'),
  )
  await lock(page)
  await denied(
    page,
    'list_sync_conflicts',
    undefined,
    'reauthentication_required',
  )
  await denied(
    page,
    'resolve_sync_conflict',
    { input },
    'reauthentication_required',
  )
  assert.deepEqual(consoleErrors, [])
  assert.equal(
    revokedSessionAccess.denied,
    true,
    `G1 revoked session can still read conflict source after server authentication rejection: ${JSON.stringify(revokedSessionAccess)}`,
  )
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        mode: 'g1-conflict-origin',
        coreResult: 'PASS',
        uiConflictResidue:
          'BLOCKED: production conflict panel is not mounted; no sensitive conflict UI exercised',
        profilePath: profileA,
        accountA,
        accountB,
        conflictId: own[0].id,
        denials,
        revokedSessionAccess,
        origins,
        sameProfileSwitch: 'PASS',
        ownerRecoveryAndResolution: 'PASS',
        consoleErrors,
        ipc: 'real WebView2 -> Tauri commands',
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
} catch (error) {
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        mode: 'g1-conflict-origin',
        coreResult: 'FAIL',
        error: String(error),
        denials,
        revokedSessionAccess,
        consoleErrors,
      },
      null,
      2,
    ),
  )
  throw error
} finally {
  for (const browser of browsers) await browser.close().catch(() => {})
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
  }
  await pool.end()
}
