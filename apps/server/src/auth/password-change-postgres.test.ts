import { readFile } from 'node:fs/promises'
import Fastify from 'fastify'
import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { AuthService, hashToken } from './service.js'
import { registerPasswordChange } from './password-change.js'

const url = process.env.TEST_DATABASE_URL
const pool = url ? new Pool({ connectionString: url }) : null
const app = Fastify()
const runtimeRole = 'password_runtime_' + randomUUID().replaceAll('-', '')
let runtime: Pool
const id = randomUUID(),
  installation = randomUUID(),
  token = 'isolated-password-test-' + randomUUID()
describe.skipIf(!pool)('actual PostgreSQL password change', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
    await pool!.query(
      "INSERT INTO users(id,business_code,username,password_hash,ui_locale,requires_password_change) VALUES($1,$2,$2,$3,'zh-CN',FALSE)",
      [id, id, await argon2.hash('bootstrap-eight', { type: argon2.argon2id })],
    )
    await pool!.query(
      "INSERT INTO account_sessions(id,user_id,token_hash,installation_id,expires_at) VALUES($1,$2,$3,$4,NOW()+interval '1 hour')",
      [randomUUID(), id, hashToken(token), installation],
    )
    await pool!.query(
      "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES(gen_random_uuid(),$1,'user',$1,'initial_super_administrator_provisioned','V1 bootstrap; password change recommended')",
      [id],
    )
    expect(
      (await new PostgresAuthStore(pool!).findAccountByUsername(id))
        ?.passwordChangeRecommended,
    ).toBe(true)
    const secret = randomUUID()
    await pool!.query(
      `CREATE ROLE "${runtimeRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${secret}'`,
    )
    const grants = await readFile(
      new URL('../../../../deploy/baota/runtime-grants.sql', import.meta.url),
      'utf8',
    )
    await pool!.query(grants.replaceAll(':"runtime_role"', `"${runtimeRole}"`))
    const connection = new URL(url!)
    connection.username = runtimeRole
    connection.password = secret
    runtime = new Pool({ connectionString: connection.toString() })
    expect(
      (await runtime.query('SELECT current_user AS role')).rows[0].role,
    ).toBe(runtimeRole)
    await expect(
      runtime.query('CREATE TABLE forbidden_runtime_ddl(id int)'),
    ).rejects.toMatchObject({ code: '42501' })
    registerPasswordChange(
      app,
      new AuthService(new PostgresAuthStore(runtime), {
        verify: argon2.verify,
      }),
      runtime,
    )
  })
  afterAll(async () => {
    await app.close()
    await runtime?.end()
    await pool!.query(`DROP OWNED BY "${runtimeRole}"`)
    await pool!.query(`DROP ROLE "${runtimeRole}"`)
    await pool!.end()
  })
  it('rejects unauthenticated calls and short replacements without changing the password', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/change-password',
          payload: {
            currentPassword: 'bootstrap-eight',
            newPassword: 'replacement-long',
          },
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/change-password',
          headers: { authorization: `Bearer ${token}` },
          payload: {
            currentPassword: 'bootstrap-eight',
            newPassword: 'eight888',
          },
        })
      ).statusCode,
    ).toBe(400)
  })
  it('rejects incorrect current password, then changes password and revokes the token', async () => {
    const request = (currentPassword: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword, newPassword: 'replacement-long' },
      })
    expect((await request('incorrect')).statusCode).toBe(401)
    const staleHash = (
      await pool!.query('SELECT password_hash FROM users WHERE id=$1', [id])
    ).rows[0].password_hash
    expect((await request('bootstrap-eight')).json()).toEqual({
      code: 'PASSWORD_CHANGED',
      requiresLogin: true,
    })
    const row = (
      await pool!.query(
        'SELECT password_hash, requires_password_change FROM users WHERE id=$1',
        [id],
      )
    ).rows[0]
    expect(await argon2.verify(row.password_hash, 'replacement-long')).toBe(
      true,
    )
    expect(row.requires_password_change).toBe(false)
    expect(
      (await new PostgresAuthStore(pool!).findAccountByUsername(id))
        ?.passwordChangeRecommended,
    ).toBe(false)
    expect((await request('replacement-long')).statusCode).toBe(401)
    await expect(
      new PostgresAuthStore(pool!).createSession({
        id: randomUUID(),
        accountId: id,
        tokenHash: hashToken('stale-' + randomUUID()),
        installationId: installation,
        expiresAt: new Date(Date.now() + 60000),
        expectedPasswordHash: staleHash,
      }),
    ).rejects.toThrow('INVALID_LOGIN')
    expect(
      (
        await pool!.query(
          "SELECT count(*) FROM audit_entries WHERE actor_id=$1 AND action='password_changed'",
          [id],
        )
      ).rows[0].count,
    ).toBe('1')
  })
  it('enforces the fifth-failure lock under concurrent current-password guesses', async () => {
    const retryToken = 'bounded-lock-' + randomUUID()
    await pool!.query(
      'UPDATE users SET failed_login_attempts=0,locked_until=NULL WHERE id=$1',
      [id],
    )
    await pool!.query(
      "INSERT INTO account_sessions(id,user_id,token_hash,installation_id,expires_at) VALUES($1,$2,$3,$4,NOW()+interval '1 hour')",
      [randomUUID(), id, hashToken(retryToken), installation],
    )
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/auth/change-password',
          headers: { authorization: `Bearer ${retryToken}` },
          payload: {
            currentPassword: 'wrong-guess',
            newPassword: 'new-replacement-password',
          },
        }),
      ),
    )
    expect(responses.filter((r) => r.statusCode === 401)).toHaveLength(5)
    expect(responses.filter((r) => r.statusCode === 423)).toHaveLength(1)
    expect(
      (
        await pool!.query(
          'SELECT failed_login_attempts FROM users WHERE id=$1',
          [id],
        )
      ).rows[0].failed_login_attempts,
    ).toBe(5)
  })
})
