import type { Pool } from 'pg'
import type { AuthorizationScope, AuthorizationStore } from './service.js'

export class PostgresAuthorizationStore implements AuthorizationStore {
  constructor(private readonly pool: Pool) {}

  async listScopes(accountId: string): Promise<AuthorizationScope[]> {
    const result = await this.pool.query<{
      project_id: string
      department_id: string
      team_id: string
      country_id: string
      site: string
      default_currency: string
      default_language_pair: string
    }>(
      `SELECT b.project_id, b.department_id, b.team_id, p.country_id, p.site, p.default_currency, p.default_language_pair
        FROM user_project_scope_bindings b
        JOIN user_project_bindings p_binding ON p_binding.user_id = b.user_id AND p_binding.project_id = b.project_id AND p_binding.deleted_at IS NULL
        JOIN projects p ON p.id = b.project_id AND p.is_active = TRUE AND p.deleted_at IS NULL
        JOIN departments d ON d.id = b.department_id AND d.is_active = TRUE AND d.deleted_at IS NULL
        JOIN teams t ON t.id = b.team_id AND t.department_id = d.id AND t.is_active = TRUE AND t.deleted_at IS NULL
        WHERE b.user_id = $1 AND b.deleted_at IS NULL
        ORDER BY p.name, d.name, t.name`,
      [accountId],
    )
    return result.rows.map((row) => ({
      projectId: row.project_id,
      departmentId: row.department_id,
      teamId: row.team_id,
      countryId: row.country_id,
      site: row.site,
      currency: row.default_currency,
      languagePair: row.default_language_pair,
    }))
  }

  async saveScope(input: {
    accountId: string
    scope: Pick<AuthorizationScope, 'projectId' | 'departmentId' | 'teamId'>
    actorId: string
  }): Promise<AuthorizationScope> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2) ON CONFLICT (user_id, project_id) DO UPDATE SET deleted_at = NULL`,
        [input.accountId, input.scope.projectId],
      )
      const valid = await client.query(
        `SELECT p.country_id, p.site, p.default_currency, p.default_language_pair
        FROM projects p JOIN departments d ON d.id = $2 AND d.is_active = TRUE AND d.deleted_at IS NULL
        JOIN teams t ON t.id = $3 AND t.department_id = d.id AND t.is_active = TRUE AND t.deleted_at IS NULL
        WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL`,
        [input.scope.projectId, input.scope.departmentId, input.scope.teamId],
      )
      if (valid.rowCount !== 1) throw new Error('invalid authorization scope')
      await client.query(
        `INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id)
        VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, project_id, department_id, team_id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()`,
        [
          input.accountId,
          input.scope.projectId,
          input.scope.departmentId,
          input.scope.teamId,
        ],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'user_project_scope_binding', $2, 'upsert')`,
        [input.actorId, input.accountId],
      )
      await client.query('COMMIT')
      const row = valid.rows[0] as {
        country_id: string
        site: string
        default_currency: string
        default_language_pair: string
      }
      return {
        ...input.scope,
        countryId: row.country_id,
        site: row.site,
        currency: row.default_currency,
        languagePair: row.default_language_pair,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
