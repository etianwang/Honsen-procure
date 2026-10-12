import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from './migration-runner.js'
import { PostgresAuthStore } from './postgres-auth-store.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null
const execFileAsync = promisify(execFile)

describe.skipIf(!pool)('PostgreSQL authentication store', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
  })

  afterAll(async () => {
    await pool!.end()
  })

  it('preserves a revoked session while enforcing one active session', async () => {
    const accountId = randomUUID()
    await pool!.query(
      `INSERT INTO users (id, business_code, username, password_hash, ui_locale)
       VALUES ($1, $2, $3, 'fixture-hash', 'zh-CN')`,
      [accountId, `AUTH-${accountId}`, `auth-${accountId}`],
    )
    await pool!.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'administrator')`,
      [accountId],
    )
    const store = new PostgresAuthStore(pool!)
    const expiresAt = new Date(Date.now() + 60_000)

    await store.createSession({
      id: randomUUID(),
      accountId,
      tokenHash: 'first-token',
      installationId: randomUUID(),
      expiresAt,
    })
    await store.createSession({
      id: randomUUID(),
      accountId,
      tokenHash: 'second-token',
      installationId: randomUUID(),
      expiresAt,
    })

    const sessions = await pool!.query<{
      token_hash: string
      revoked: boolean
    }>(
      `SELECT token_hash, revoked_at IS NOT NULL AS revoked
       FROM account_sessions
       WHERE user_id = $1
       ORDER BY token_hash`,
      [accountId],
    )
    expect(sessions.rows).toEqual([
      { token_hash: 'first-token', revoked: true },
      { token_hash: 'second-token', revoked: false },
    ])
    expect(
      (await store.findActiveSession('second-token', new Date()))?.roles,
    ).toEqual(['administrator'])
    expect(await store.findActiveSession('first-token', new Date())).toBeNull()
  })

  it('provisions an initial super administrator on the migrated store', async () => {
    const suffix = randomUUID()
    const username = `admin-${suffix}`
    const businessCode = `ADMIN-${suffix}`
    const script = fileURLToPath(
      new URL('../scripts/provision-super-admin.ts', import.meta.url),
    )
    const tsx = fileURLToPath(
      new URL('../../../../node_modules/tsx/dist/cli.mjs', import.meta.url),
    )

    await execFileAsync(
      process.execPath,
      [tsx, script, username, 'fixture-password', businessCode],
      {
        env: { ...process.env, POSTGRES_URL: databaseUrl },
      },
    )

    const result = await pool!.query<{
      business_code: string
      role: string
      action: string
    }>(
      `SELECT u.business_code, ur.role, a.action
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN audit_entries a ON a.actor_id = u.id
       WHERE u.username = $1`,
      [username],
    )
    expect(result.rows).toEqual([
      {
        business_code: businessCode,
        role: 'super_administrator',
        action: 'initial_super_administrator_provisioned',
      },
    ])
  })
})
