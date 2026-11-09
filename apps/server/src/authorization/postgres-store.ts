import type { Pool, PoolClient } from 'pg'
import {
  AuthorizationError,
  type AuthorizationScope,
  type AuthorizationStore,
} from './service.js'

export class PostgresAuthorizationStore implements AuthorizationStore {
  constructor(private readonly pool: Pool) {}

  async lockManagedAccount(
    client: PoolClient,
    actorId: string,
    accountId: string,
    tokenHash: string,
  ) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('honsen:super-admin-protection',0))",
    )
    const records = await client.query<{
      id: string
      username: string
      display_name: string | null
      ui_locale: string
      is_enabled: boolean
      requires_password_change: boolean
      locked_until: Date | null
      account_version: string
    }>(
      'SELECT id,username,display_name,ui_locale,is_enabled,requires_password_change,locked_until,xmin::text AS account_version FROM users WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE',
      [[actorId, accountId]],
    )
    const actor = records.rows.find((row) => row.id === actorId)
    if (!actor?.is_enabled || actor.requires_password_change)
      throw new AuthorizationError('FORBIDDEN')
    const session = await client.query(
      'SELECT 1 FROM account_sessions WHERE user_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>NOW()',
      [actorId, tokenHash],
    )
    if (session.rowCount !== 1) throw new AuthorizationError('FORBIDDEN')
    const bindings = await client.query<{ user_id: string; role: string }>(
      'SELECT user_id,role FROM user_roles WHERE user_id=ANY($1::uuid[])',
      [[actorId, accountId]],
    )
    const actorRoles = bindings.rows
      .filter((row) => row.user_id === actorId)
      .map((row) => row.role)
    const privileged = actorRoles.includes('super_administrator')
    if (!privileged && !actorRoles.includes('administrator'))
      throw new AuthorizationError('FORBIDDEN')
    const target = records.rows.find((row) => row.id === accountId)
    if (!target) return null
    const roles = bindings.rows
      .filter((row) => row.user_id === accountId)
      .map((row) => row.role)
      .sort()
    if (
      target.username.toLowerCase() === 'admin' ||
      roles.includes('super_administrator')
    )
      throw new AuthorizationError('FORBIDDEN')
    if (!privileged) {
      if (
        actorId === accountId ||
        roles.some((role) => role === 'administrator' || role === 'purchaser')
      )
        throw new AuthorizationError('FORBIDDEN')
      const scopes = await client.query(
        `SELECT EXISTS(SELECT 1 FROM user_project_scope_bindings b WHERE b.user_id=$2 AND b.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM user_project_scope_bindings b WHERE b.user_id=$2 AND b.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM user_project_scope_bindings own JOIN user_project_bindings pb ON pb.user_id=own.user_id AND pb.project_id=own.project_id AND pb.deleted_at IS NULL JOIN projects p ON p.id=own.project_id AND p.is_active AND p.deleted_at IS NULL JOIN countries c ON c.id=p.country_id AND c.is_active AND c.deleted_at IS NULL JOIN departments d ON d.id=own.department_id AND d.is_active AND d.deleted_at IS NULL JOIN teams t ON t.id=own.team_id AND t.department_id=d.id AND t.is_active AND t.deleted_at IS NULL WHERE own.user_id=$1 AND own.project_id=b.project_id AND own.department_id=b.department_id AND own.team_id=b.team_id AND own.deleted_at IS NULL)) AS allowed`,
        [actorId, accountId],
      )
      if (!scopes.rows[0]?.allowed) throw new AuthorizationError('FORBIDDEN')
    }
    return { target, roles, privileged }
  }

  async listManagedScopes(
    actorId: string,
    accountId: string,
  ): Promise<AuthorizationScope[]> {
    const allowed = await this.pool.query(
      `SELECT 1 FROM users u WHERE u.id=$1 AND u.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('super_administrator','administrator','purchaser'))`,
      [accountId],
    )
    if (allowed.rowCount !== 1) throw new AuthorizationError('FORBIDDEN')
    const [own, target] = await Promise.all([
      this.listScopes(actorId),
      this.listScopes(accountId),
    ])
    return target.filter((scope) =>
      own.some(
        (candidate) =>
          candidate.projectId === scope.projectId &&
          candidate.departmentId === scope.departmentId &&
          candidate.teamId === scope.teamId,
      ),
    )
  }

  private async assertDelegation(
    client: PoolClient,
    actorId: string,
    accountId: string,
    scope: Pick<AuthorizationScope, 'projectId' | 'departmentId' | 'teamId'>,
  ) {
    // Serialize provisioning/delegation with changes to either account's bindings.
    const locked = await client.query(
      'SELECT id FROM users WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE',
      [[actorId, accountId]],
    )
    if (locked.rowCount !== new Set([actorId, accountId]).size)
      throw new AuthorizationError('FORBIDDEN')
    const result = await client.query(
      `SELECT 1 FROM users u WHERE u.id=$1 AND u.is_enabled AND u.deleted_at IS NULL AND (EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='super_administrator') OR (u.id<>$2 AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role='administrator') AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$2 AND role IN ('super_administrator','administrator','purchaser')) AND EXISTS(SELECT 1 FROM user_project_scope_bindings b JOIN user_project_bindings p ON p.user_id=b.user_id AND p.project_id=b.project_id AND p.deleted_at IS NULL WHERE b.user_id=u.id AND b.project_id=$3 AND b.department_id=$4 AND b.team_id=$5 AND b.deleted_at IS NULL)))`,
      [actorId, accountId, scope.projectId, scope.departmentId, scope.teamId],
    )
    if (result.rowCount !== 1) throw new AuthorizationError('FORBIDDEN')
  }

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
        JOIN countries c ON c.id=p.country_id AND c.is_active=TRUE AND c.deleted_at IS NULL
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
      await this.assertDelegation(
        client,
        input.actorId,
        input.accountId,
        input.scope,
      )
      await client.query(
        `INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2) ON CONFLICT (user_id, project_id) DO UPDATE SET deleted_at = NULL`,
        [input.accountId, input.scope.projectId],
      )
      const valid = await client.query(
        `SELECT p.country_id, p.site, p.default_currency, p.default_language_pair
        FROM projects p JOIN countries c ON c.id=p.country_id AND c.is_active=TRUE AND c.deleted_at IS NULL JOIN departments d ON d.id = $2 AND d.is_active = TRUE AND d.deleted_at IS NULL
        JOIN teams t ON t.id = $3 AND t.department_id = d.id AND t.is_active = TRUE AND t.deleted_at IS NULL
        WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL`,
        [input.scope.projectId, input.scope.departmentId, input.scope.teamId],
      )
      if (valid.rowCount !== 1) throw new AuthorizationError('INVALID_SCOPE')
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

  async revokeScope(input: {
    accountId: string
    scope: Pick<AuthorizationScope, 'projectId' | 'departmentId' | 'teamId'>
    actorId: string
  }): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await this.assertDelegation(
        client,
        input.actorId,
        input.accountId,
        input.scope,
      )
      await client.query(
        `UPDATE user_project_scope_bindings
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND project_id = $2 AND department_id = $3 AND team_id = $4
           AND deleted_at IS NULL`,
        [
          input.accountId,
          input.scope.projectId,
          input.scope.departmentId,
          input.scope.teamId,
        ],
      )
      await client.query(
        `UPDATE user_project_bindings
         SET deleted_at = NOW()
         WHERE user_id = $1 AND project_id = $2 AND deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM user_project_scope_bindings
             WHERE user_id = $1 AND project_id = $2 AND deleted_at IS NULL
           )`,
        [input.accountId, input.scope.projectId],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, 'user_project_scope_binding', $2, 'revoke')`,
        [input.actorId, input.accountId],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async replaceScope(input: {
    accountId: string
    oldScope: Pick<AuthorizationScope, 'projectId' | 'departmentId' | 'teamId'>
    newScope: Pick<AuthorizationScope, 'projectId' | 'departmentId' | 'teamId'>
    actorId: string
  }): Promise<AuthorizationScope> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await this.assertDelegation(
        client,
        input.actorId,
        input.accountId,
        input.oldScope,
      )
      await this.assertDelegation(
        client,
        input.actorId,
        input.accountId,
        input.newScope,
      )
      const valid = await client.query<{
        country_id: string
        site: string
        default_currency: string
        default_language_pair: string
      }>(
        `SELECT p.country_id, p.site, p.default_currency, p.default_language_pair
         FROM projects p JOIN countries c ON c.id=p.country_id AND c.is_active=TRUE AND c.deleted_at IS NULL JOIN departments d ON d.id = $2 AND d.is_active = TRUE AND d.deleted_at IS NULL
         JOIN teams t ON t.id = $3 AND t.department_id = d.id AND t.is_active = TRUE AND t.deleted_at IS NULL
         WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL`,
        [
          input.newScope.projectId,
          input.newScope.departmentId,
          input.newScope.teamId,
        ],
      )
      if (valid.rowCount !== 1) throw new AuthorizationError('INVALID_SCOPE')
      const removed = await client.query(
        `UPDATE user_project_scope_bindings SET deleted_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND project_id = $2 AND department_id = $3 AND team_id = $4 AND deleted_at IS NULL`,
        [
          input.accountId,
          input.oldScope.projectId,
          input.oldScope.departmentId,
          input.oldScope.teamId,
        ],
      )
      if (removed.rowCount !== 1) throw new AuthorizationError('INVALID_SCOPE')
      await client.query(
        `INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)
         ON CONFLICT (user_id, project_id) DO UPDATE SET deleted_at = NULL`,
        [input.accountId, input.newScope.projectId],
      )
      await client.query(
        `INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, project_id, department_id, team_id)
         DO UPDATE SET deleted_at = NULL, updated_at = NOW()`,
        [
          input.accountId,
          input.newScope.projectId,
          input.newScope.departmentId,
          input.newScope.teamId,
        ],
      )
      await client.query(
        `UPDATE user_project_bindings SET deleted_at = NOW()
         WHERE user_id = $1 AND project_id = $2 AND deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM user_project_scope_bindings WHERE user_id = $1 AND project_id = $2 AND deleted_at IS NULL)`,
        [input.accountId, input.oldScope.projectId],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, 'user_project_scope_binding', $2, 'replace')`,
        [input.actorId, input.accountId],
      )
      await client.query('COMMIT')
      const row = valid.rows[0]!
      return {
        ...input.newScope,
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
