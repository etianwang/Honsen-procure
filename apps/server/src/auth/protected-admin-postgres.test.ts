import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import argon2 from 'argon2'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { recoverAdmin } from './recover-admin.js'
import { PostgresAuthorizationStore } from '../authorization/postgres-store.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { AuthService, hashToken } from './service.js'

const url = process.env.TEST_DATABASE_URL
const control = url ? new Pool({ connectionString: url }) : null
const database = 'protected_admin_' + randomUUID().replaceAll('-', '')
const role = 'protected_runtime_' + randomUUID().replaceAll('-', '')
const owner = 'protected_owner_' + randomUUID().replaceAll('-', '')
let pool: Pool, runtime: Pool
const admin = randomUUID(),
  ordinary = randomUUID()
const initial = 'test-only-original-' + randomUUID()
describe.skipIf(!control)('permanent administrator PostgreSQL safety', () => {
  beforeAll(async () => {
    const ownerPassword = randomUUID()
    await control!.query(
      `CREATE ROLE "${owner}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${ownerPassword}'`,
    )
    await control!.query(`CREATE DATABASE "${database}" OWNER "${owner}"`)
    const connection = new URL(url!)
    connection.pathname = '/' + database
    connection.username = owner
    connection.password = ownerPassword
    pool = new Pool({ connectionString: connection.toString() })
    await runMigrations(pool)
    // Restore the exact pre-015 object boundary in this owned disposable DB.
    await pool.query(
      'DROP FUNCTION protect_super_administrators() CASCADE; DROP FUNCTION deny_administrator_truncate() CASCADE; DROP FUNCTION audit_administrator_governance() CASCADE',
    )
    for (const [id, username] of [
      [admin, 'admin'],
      [ordinary, 'independent-test-administrator'],
    ]) {
      await pool.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES($1::uuid,$1::text,$2,$3,'zh-CN')",
        [id, username, await argon2.hash(initial)],
      )
      await pool.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [
        id,
        id === admin ? 'super_administrator' : 'administrator',
      ])
    }
    const before = (await pool.query('SELECT * FROM users ORDER BY id')).rows
    await pool.query(
      await readFile(
        new URL('../../migrations/015_protected_admin.sql', import.meta.url),
        'utf8',
      ),
    )
    expect((await pool.query('SELECT * FROM users ORDER BY id')).rows).toEqual(
      before,
    )
    const password = randomUUID()
    await control!.query(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    )
    const grants = await readFile(
      new URL('../../../../deploy/baota/runtime-grants.sql', import.meta.url),
      'utf8',
    )
    await pool.query(grants.replaceAll(':"runtime_role"', `"${role}"`))
    connection.username = role
    connection.password = password
    runtime = new Pool({ connectionString: connection.toString() })
  })
  afterAll(async () => {
    await runtime?.end()
    await pool?.end()
    if (control) {
      await control.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      await control.query(`DROP ROLE IF EXISTS "${role}"`)
      await control.query(`DROP ROLE IF EXISTS "${owner}"`)
      await control.end()
    }
  })
  it('denies rename, disable, deletion, ID change and downgrade; permits normal password hashing', async () => {
    await expect(pool.query('TRUNCATE users CASCADE')).rejects.toMatchObject({
      code: '23514',
    })
    await expect(pool.query('TRUNCATE user_roles')).rejects.toMatchObject({
      code: '23514',
    })
    for (const sql of [
      "UPDATE users SET username='renamed' WHERE id=$1",
      'UPDATE users SET is_enabled=FALSE WHERE id=$1',
      'UPDATE users SET deleted_at=NOW() WHERE id=$1',
      'UPDATE users SET id=gen_random_uuid() WHERE id=$1',
      'DELETE FROM users WHERE id=$1',
      "DELETE FROM user_roles WHERE user_id=$1 AND role='super_administrator'",
      "UPDATE user_roles SET role='viewer' WHERE user_id=$1",
    ]) {
      await expect(pool.query(sql, [admin])).rejects.toMatchObject({
        code: '23514',
      })
    }
    await runtime.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
      admin,
      await argon2.hash(initial),
    ])
    expect(
      (await pool.query("SELECT id FROM users WHERE username='admin'")).rows[0]
        .id,
    ).toBe(admin)
  })
  it('denies ordinary administrator changes to protected scope through every store operation', async () => {
    const store = new PostgresAuthorizationStore(runtime)
    const scope = {
      projectId: randomUUID(),
      departmentId: randomUUID(),
      teamId: randomUUID(),
    }
    for (const operation of [
      () => store.saveScope({ accountId: admin, actorId: ordinary, scope }),
      () => store.revokeScope({ accountId: admin, actorId: ordinary, scope }),
      () =>
        store.replaceScope({
          accountId: admin,
          actorId: ordinary,
          oldScope: scope,
          newScope: scope,
        }),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
  })
  it('serializes competing super-administrator losses and preserves existing final-two rule', async () => {
    const ids = [randomUUID(), randomUUID()]
    for (const id of ids) {
      await pool.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES($1::uuid,$1::text,$1::text,'test-unused-hash','zh-CN')",
        [id],
      )
      await pool.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1,'super_administrator')",
        [id],
      )
    }
    const outcomes = await Promise.allSettled(
      ids.map((id) =>
        pool.query('UPDATE users SET is_enabled=FALSE WHERE id=$1', [id]),
      ),
    )
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.is_enabled AND u.deleted_at IS NULL AND r.role='super_administrator'",
        )
      ).rows[0].n,
    ).toBe(2)
  })
  it('requires maintenance owner and strong input, retaining password and sessions on rejection', async () => {
    await expect(
      recoverAdmin(runtime, {
        password: 'replacement-test-password',
        operator: 'test operator',
        reason: 'test denied owner',
      }),
    ).rejects.toThrow('MAINTENANCE_OWNER_REQUIRED')
    await expect(
      recoverAdmin(pool, {
        password: 'short',
        operator: 'test operator',
        reason: 'test',
      }),
    ).rejects.toThrow()
    expect(
      await argon2.verify(
        (
          await pool.query('SELECT password_hash FROM users WHERE id=$1', [
            admin,
          ])
        ).rows[0].password_hash,
        initial,
      ),
    ).toBe(true)
  })
  it('rolls back password and session changes if recovery audit cannot be committed', async () => {
    const before = (
      await pool.query('SELECT password_hash FROM users WHERE id=$1', [admin])
    ).rows[0].password_hash
    await pool.query(
      "INSERT INTO account_sessions(id,user_id,token_hash,installation_id,expires_at) VALUES(gen_random_uuid(),$1,$2,gen_random_uuid(),NOW()+interval '1 hour')",
      [admin, randomUUID()],
    )
    await pool.query(
      "ALTER TABLE audit_entries ADD CONSTRAINT reject_test_recovery CHECK(action <> 'admin_password_recovered')",
    )
    try {
      await expect(
        recoverAdmin(pool, {
          password: 'test-rollback-' + randomUUID(),
          operator: 'isolated test maintainer',
          reason: 'audit failure injection',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      expect(
        (
          await pool.query('SELECT password_hash FROM users WHERE id=$1', [
            admin,
          ])
        ).rows[0].password_hash,
      ).toBe(before)
      expect(
        (
          await pool.query(
            'SELECT 1 FROM account_sessions WHERE user_id=$1 AND revoked_at IS NULL',
            [admin],
          )
        ).rowCount,
      ).toBe(1)
    } finally {
      await pool.query(
        'ALTER TABLE audit_entries DROP CONSTRAINT reject_test_recovery',
      )
    }
  })
  it('recovers the same account, preserves roles/history, revokes all sessions and records operator/reason without password', async () => {
    const store = new PostgresAuthStore(runtime)
    const auth = new AuthService(store, { verify: argon2.verify })
    const staleHash = (
      await pool.query('SELECT password_hash FROM users WHERE id=$1', [admin])
    ).rows[0].password_hash
    const oldToken = 'test-only-session-' + randomUUID()
    await pool.query(
      "INSERT INTO account_sessions(id,user_id,token_hash,installation_id,expires_at) VALUES(gen_random_uuid(),$1,$2,gen_random_uuid(),NOW()+interval '1 hour')",
      [admin, hashToken(oldToken)],
    )
    const password = 'test-only-recovery-' + randomUUID()
    expect(
      await recoverAdmin(pool, {
        password,
        operator: 'isolated test maintainer',
        reason: 'explicit isolated recovery test',
      }),
    ).toBe(admin)
    const row = (await pool.query('SELECT * FROM users WHERE id=$1', [admin]))
      .rows[0]
    expect(row.username).toBe('admin')
    expect(await argon2.verify(row.password_hash, password)).toBe(true)
    expect(
      (
        await pool.query(
          'SELECT 1 FROM account_sessions WHERE user_id=$1 AND revoked_at IS NULL',
          [admin],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool.query('SELECT role FROM user_roles WHERE user_id=$1', [
          admin,
        ])
      ).rows,
    ).toEqual([{ role: 'super_administrator' }])
    const audit = (
      await pool.query(
        "SELECT actor_id,reason FROM audit_entries WHERE entity_id=$1 AND action='admin_password_recovered'",
        [admin],
      )
    ).rows
    expect(audit).toHaveLength(1)
    expect(audit[0].actor_id).toBeNull()
    expect(audit[0].reason).toContain('isolated test maintainer')
    expect(audit[0].reason).not.toContain(password)
    await expect(auth.authenticate(oldToken)).rejects.toThrow('INVALID_LOGIN')
    await expect(
      store.createSession({
        id: randomUUID(),
        accountId: admin,
        tokenHash: hashToken(randomUUID()),
        installationId: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
        expectedPasswordHash: staleHash,
      }),
    ).rejects.toThrow('INVALID_LOGIN')
    const captcha = auth.captchas.issue()
    const answer = String(
      captcha.question
        .match(/\d+/g)!
        .map(Number)
        .reduce((a, b) => a + b, 0),
    )
    const login = await auth.login(
      {
        username: 'admin',
        password,
        captchaId: captcha.id,
        captchaAnswer: answer,
      },
      randomUUID(),
    )
    expect(login.user.id).toBe(admin)
    expect(login.user.roles).toEqual(['super_administrator'])
    expect((await auth.authenticate(login.accessToken)).id).toBe(admin)
  })
})
