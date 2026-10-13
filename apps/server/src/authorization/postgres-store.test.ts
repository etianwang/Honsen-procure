import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresAuthorizationStore } from './postgres-store.js'
import { AuthorizationError } from './service.js'

describe('PostgresAuthorizationStore', () => {
  it('rolls back a replacement when the old binding is not active', async () => {
    const calls: string[] = []
    const client = {
      async query(sql: string) {
        calls.push(sql)
        if (sql.includes('SELECT p.country_id')) {
          return {
            rowCount: 1,
            rows: [
              {
                country_id: 'country',
                site: 'site',
                default_currency: 'XOF',
                default_language_pair: 'zh_fr',
              },
            ],
          }
        }
        if (sql.includes('UPDATE user_project_scope_bindings'))
          return { rowCount: 0, rows: [] }
        return { rowCount: 1, rows: [] }
      },
      release() {},
    }
    const pool = {
      async connect() {
        return client
      },
    } as unknown as Pool
    const store = new PostgresAuthorizationStore(pool)
    const scope = {
      projectId: 'project',
      departmentId: 'department',
      teamId: 'team',
    }
    await expect(
      store.replaceScope({
        accountId: 'account',
        actorId: 'actor',
        oldScope: scope,
        newScope: scope,
      }),
    ).rejects.toEqual(new AuthorizationError('INVALID_SCOPE'))
    expect(calls).toContain('ROLLBACK')
    expect(
      calls.some((sql) =>
        sql.includes('INSERT INTO user_project_scope_bindings'),
      ),
    ).toBe(false)
  })
})

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null

describe.skipIf(!pool)('PostgreSQL authorization bindings', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
  })

  afterAll(async () => {
    await pool!.end()
  })

  it('grants, atomically replaces and revokes a scoped binding', async () => {
    const [
      accountId,
      countryId,
      projectId,
      departmentId,
      firstTeamId,
      secondTeamId,
    ] = Array.from({ length: 6 }, () => randomUUID())
    await pool!.query(
      `INSERT INTO users (id, business_code, username, password_hash, ui_locale)
       VALUES ($1, $2, $3, 'fixture-hash', 'zh-CN')`,
      [accountId, `AUTHZ-${accountId}`, `authz-${accountId}`],
    )
    await pool!.query(
      `INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'test country', 'UTC')`,
      [countryId, `AZC-${countryId}`],
    )
    await pool!.query(
      `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair)
       VALUES ($1, $2, $3, 'test project', 'test site', 'test department', 'XOF', 'zh_fr')`,
      [projectId, countryId, `AZP-${projectId}`],
    )
    await pool!.query(
      `INSERT INTO departments (id, business_code, name) VALUES ($1, $2, 'test department')`,
      [departmentId, `AZD-${departmentId}`],
    )
    for (const teamId of [firstTeamId, secondTeamId]) {
      await pool!.query(
        `INSERT INTO teams (id, department_id, business_code, name) VALUES ($1, $2, $3, 'test team')`,
        [teamId, departmentId, `AZT-${teamId}`],
      )
    }

    const store = new PostgresAuthorizationStore(pool!)
    const oldScope = { projectId, departmentId, teamId: firstTeamId }
    const newScope = { projectId, departmentId, teamId: secondTeamId }
    await expect(
      store.saveScope({ accountId, actorId: accountId, scope: oldScope }),
    ).resolves.toMatchObject(oldScope)
    expect(await store.listScopes(accountId)).toMatchObject([oldScope])

    await expect(
      store.replaceScope({ accountId, actorId: accountId, oldScope, newScope }),
    ).resolves.toMatchObject(newScope)
    expect(await store.listScopes(accountId)).toMatchObject([newScope])

    await expect(
      store.replaceScope({
        accountId,
        actorId: accountId,
        oldScope: newScope,
        newScope: { ...newScope, teamId: randomUUID() },
      }),
    ).rejects.toEqual(new AuthorizationError('INVALID_SCOPE'))
    expect(await store.listScopes(accountId)).toMatchObject([newScope])

    await store.revokeScope({ accountId, actorId: accountId, scope: newScope })
    expect(await store.listScopes(accountId)).toEqual([])
    const projectBinding = await pool!.query<{ deleted: boolean }>(
      `SELECT deleted_at IS NOT NULL AS deleted FROM user_project_bindings WHERE user_id = $1 AND project_id = $2`,
      [accountId, projectId],
    )
    expect(projectBinding.rows).toEqual([{ deleted: true }])
  })
})
