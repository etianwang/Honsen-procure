import argon2 from 'argon2'
import { AuthService } from '../auth/service.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
const source = process.env.TEST_DATABASE_URL
const owner = source ? new Pool({ connectionString: source }) : null
const name = 'bootstrap_test_' + randomUUID().replaceAll('-', '')
let pool: Pool
let connection: string
function bootstrap() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'src/scripts/bootstrap-v1.ts'],
      {
        env: { ...process.env, POSTGRES_URL: connection },
        input: 'test8888\n',
        encoding: 'utf8',
      },
    ),
  )
}
describe.skipIf(!owner)('isolated PostgreSQL V1 bootstrap', () => {
  beforeAll(async () => {
    await owner!.query(`CREATE DATABASE "${name}"`)
    const url = new URL(source!)
    url.pathname = '/' + name
    connection = url.toString()
    pool = new Pool({ connectionString: connection })
    await runMigrations(pool)
  })
  afterAll(async () => {
    await pool?.end()
    await owner!.query(`DROP DATABASE IF EXISTS "${name}"`)
    await owner!.end()
  })
  it('rolls back accounts, master data and sync publication on an actual SQL failure', async () => {
    await pool.query(
      'ALTER TABLE units ADD CONSTRAINT bootstrap_failure_test CHECK (FALSE)',
    )
    expect(() => bootstrap()).toThrow()
    for (const table of [
      'users',
      'countries',
      'projects',
      'units',
      'sync_entities',
      'server_change_log',
    ])
      expect(
        (await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
      ).toBe('0')
    await pool.query('ALTER TABLE units DROP CONSTRAINT bootstrap_failure_test')
  })
  it('atomically seeds approved data, publishes all records, and repeat never resets password', async () => {
    expect(bootstrap()).toMatchObject({
      status: 'initialized',
      countries: 2,
      projects: 3,
      units: 14,
      sites: 0,
      taxConfiguration: 'BLOCKED_UNVERIFIED_AUTHORITY',
    })
    expect(
      (
        await pool.query(
          'SELECT name,default_currency FROM projects ORDER BY business_code',
        )
      ).rows,
    ).toEqual([
      { name: 'Bethel2办公楼', default_currency: 'XOF' },
      { name: 'Kerene别墅', default_currency: 'XOF' },
      { name: 'Minrex数据中心', default_currency: 'XAF' },
    ])
    expect((await pool.query('SELECT count(*) FROM sites')).rows[0].count).toBe(
      '0',
    )
    expect(
      (await pool.query('SELECT count(*) FROM sync_entities')).rows[0].count,
    ).toBe('19')
    expect(
      (await pool.query('SELECT count(*) FROM server_change_log')).rows[0]
        .count,
    ).toBe('19')
    const original = (
      await pool.query(
        "SELECT password_hash,requires_password_change FROM users WHERE username='admin'",
      )
    ).rows[0]
    expect(original.requires_password_change).toBe(false)
    const auth = new AuthService(new PostgresAuthStore(pool), {
      verify: argon2.verify,
    })
    const challenge = auth.captchas.issue()
    const digits = challenge.question.match(/\d+/g)!.map(Number)
    const login = await auth.login(
      {
        username: 'admin',
        password: 'test8888',
        captchaId: challenge.id,
        captchaAnswer: String(digits[0]! + digits[1]!),
      },
      randomUUID(),
    )
    expect(login.user).toMatchObject({
      username: 'admin',
      roles: ['super_administrator'],
      requiresPasswordChange: false,
      passwordChangeRecommended: true,
    })
    expect(bootstrap()).toEqual({
      status: 'already_initialized',
      passwordReset: false,
    })
    expect(
      (
        await pool.query(
          "SELECT password_hash FROM users WHERE username='admin'",
        )
      ).rows[0].password_hash,
    ).toBe(original.password_hash)
    expect(
      (await pool.query('SELECT count(*) FROM server_change_log')).rows[0]
        .count,
    ).toBe('19')
  })
})
