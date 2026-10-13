import type { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
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
