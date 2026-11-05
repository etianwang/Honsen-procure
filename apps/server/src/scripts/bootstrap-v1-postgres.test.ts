import { applyApprovedV1TaxConfig } from './v1-tax-config.js'
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
  it('rolls back every initial record when tax/default configuration fails after tax publication', async () => {
    await pool.query(
      'ALTER TABLE project_print_defaults ADD CONSTRAINT tax_seed_failure_test CHECK(FALSE)',
    )
    expect(() => bootstrap()).toThrow()
    for (const table of [
      'users',
      'countries',
      'projects',
      'units',
      'tax_templates',
      'project_print_defaults',
      'sync_entities',
      'server_change_log',
    ])
      expect(
        (await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
      ).toBe('0')
    await pool.query(
      'ALTER TABLE project_print_defaults DROP CONSTRAINT tax_seed_failure_test',
    )
  })
  it('atomically seeds approved data, publishes all records, and repeat never resets password', async () => {
    expect(bootstrap()).toMatchObject({
      status: 'initialized',
      countries: 2,
      projects: 3,
      units: 14,
      sites: 0,
      taxConfiguration: {
        status: 'applied_user_approved_configuration',
        taxTemplates: 2,
        projectDefaults: 3,
      },
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
    ).toBe('24')
    expect(
      (await pool.query('SELECT count(*) FROM server_change_log')).rows[0]
        .count,
    ).toBe('24')
    const original = (
      await pool.query(
        "SELECT password_hash,requires_password_change FROM users WHERE username='admin'",
      )
    ).rows[0]
    const configured = (
      await pool.query(
        'SELECT p.business_code,t.rate_basis_points FROM project_print_defaults d JOIN projects p ON p.id=d.project_id JOIN tax_templates t ON t.id=d.default_tax_template_id ORDER BY p.business_code',
      )
    ).rows
    expect(configured).toEqual([
      { business_code: 'BETHEL2', rate_basis_points: 1800 },
      { business_code: 'KERENE', rate_basis_points: 1800 },
      { business_code: 'MINREX', rate_basis_points: 1925 },
    ])
    expect(
      (
        await pool.query(
          "SELECT payload_json FROM sync_entities WHERE entity_type='tax_template' ORDER BY payload_json->>'businessCode'",
        )
      ).rows.map((r) => ({
        rate: r.payload_json.rateBasisPoints,
        version: r.payload_json.version,
      })),
    ).toEqual([
      { rate: 1800, version: 1 },
      { rate: 1925, version: 1 },
    ])
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
      taxConfiguration: {
        status: 'already_applied_preserving_user_configuration',
        taxTemplates: 0,
        projectDefaults: 0,
      },
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
    ).toBe('24')
  })
  it('keeps user-edited tax/default records on repeated bootstrap', async () => {
    await pool.query(
      "UPDATE tax_templates SET rate_basis_points=1700,version=version+1 WHERE business_code='CI-VAT'",
    )
    const before = (
      await pool.query(
        'SELECT row_to_json(t) AS data FROM tax_templates t ORDER BY business_code',
      )
    ).rows
    expect(
      JSON.parse(
        execFileSync(
          process.execPath,
          ['--import', 'tsx', 'src/scripts/apply-v1-tax-config.ts'],
          {
            env: { ...process.env, POSTGRES_URL: connection },
            encoding: 'utf8',
          },
        ),
      ).status,
    ).toBe('already_applied_preserving_user_configuration')
    expect(bootstrap().taxConfiguration.status).toBe(
      'already_applied_preserving_user_configuration',
    )
    expect(
      (
        await pool.query(
          'SELECT row_to_json(t) AS data FROM tax_templates t ORDER BY business_code',
        )
      ).rows,
    ).toEqual(before)
  })
  it('adds approved tax configuration to a legacy bootstrap candidate transactionally and rejects conflicting existing settings', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const admin = (
        await client.query(
          "SELECT id,password_hash FROM users WHERE username='admin'",
        )
      ).rows[0]
      // Reversible synthetic fixture: emulate the earlier candidate lacking tax defaults.
      await client.query(
        "DELETE FROM server_change_log WHERE entity_type IN ('tax_template','project_defaults'); DELETE FROM sync_entities WHERE entity_type IN ('tax_template','project_defaults'); DELETE FROM project_print_defaults; DELETE FROM tax_templates; DELETE FROM audit_entries WHERE action IN ('v1_tax_defaults_seeded','v1_user_approved_tax_created')",
      )
      await client.query('SAVEPOINT legacy_empty')
      await client.query(
        "INSERT INTO tax_templates(id,business_code,name,rate_basis_points,effective_at,is_active) VALUES(gen_random_uuid(),'CM-VAT','Existing operator configuration',100,'2026-11-06',TRUE)",
      )
      await client.query('SAVEPOINT existing_configuration')
      await expect(applyApprovedV1TaxConfig(client, admin.id)).rejects.toThrow(
        'TAX_SEED_EXISTING_CONFIGURATION_REQUIRES_REVIEW',
      )
      await client.query('ROLLBACK TO SAVEPOINT legacy_empty')
      expect(await applyApprovedV1TaxConfig(client, admin.id)).toMatchObject({
        status: 'applied_user_approved_configuration',
        taxTemplates: 2,
        projectDefaults: 3,
      })
      expect(
        (await client.query('SELECT count(*) FROM project_print_defaults'))
          .rows[0].count,
      ).toBe('3')
      expect(
        (
          await client.query(
            'SELECT rate_basis_points FROM tax_templates ORDER BY business_code',
          )
        ).rows.map((r) => r.rate_basis_points),
      ).toEqual([1800, 1925])
      expect(
        (
          await client.query(
            "SELECT password_hash FROM users WHERE username='admin'",
          )
        ).rows[0].password_hash,
      ).toBe(admin.password_hash)
      expect(
        (await client.query('SELECT count(*) FROM sites')).rows[0].count,
      ).toBe('0')
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
})
