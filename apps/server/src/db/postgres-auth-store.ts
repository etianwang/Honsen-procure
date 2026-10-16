import { Pool } from 'pg'
import type {
  AuthStore,
  AuthenticatedAccount,
  LoginAccount,
} from '../auth/types.js'

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async findAccountByUsername(username: string): Promise<LoginAccount | null> {
    return this.findAccount(
      `SELECT u.id, u.username, u.password_hash, u.ui_locale, u.is_enabled,
              u.locked_until, u.requires_password_change,
              COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.username = $1 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [username],
    )
  }

  async findActiveSession(
    tokenHash: string,
    now: Date,
  ): Promise<AuthenticatedAccount | null> {
    const result = await this.pool.query<{
      id: string
      username: string
      password_hash: string
      roles: LoginAccount['roles']
      ui_locale: LoginAccount['locale']
      is_enabled: boolean
      locked_until: Date | null
      requires_password_change: boolean
      installation_id: string
    }>(
      `SELECT u.id, u.username, u.password_hash, u.ui_locale, u.is_enabled,
              u.locked_until, u.requires_password_change,
              s.installation_id,
              COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM account_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [tokenHash, now],
    )
    const row = result.rows[0]
    return row
      ? {
          id: row.id,
          username: row.username,
          passwordHash: row.password_hash,
          roles: row.roles,
          locale: row.ui_locale,
          isEnabled: row.is_enabled,
          lockedUntil: row.locked_until,
          requiresPasswordChange: row.requires_password_change,
          installationId: row.installation_id,
        }
      : null
  }

  private async findAccount(
    query: string,
    values: unknown[],
  ): Promise<LoginAccount | null> {
    const result = await this.pool.query<{
      id: string
      username: string
      password_hash: string
      roles: LoginAccount['roles']
      ui_locale: LoginAccount['locale']
      is_enabled: boolean
      locked_until: Date | null
      requires_password_change: boolean
    }>(query, values)
    const row = result.rows[0]
    return row
      ? {
          id: row.id,
          username: row.username,
          passwordHash: row.password_hash,
          roles: row.roles,
          locale: row.ui_locale,
          isEnabled: row.is_enabled,
          lockedUntil: row.locked_until,
          requiresPasswordChange: row.requires_password_change,
        }
      : null
  }

  async registerFailedLogin(accountId: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN $2 + interval '15 minutes' ELSE locked_until END,
           updated_at = $2
       WHERE id = $1`,
      [accountId, now],
    )
  }

  async registerSuccessfulLogin(accountId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1`,
      [accountId],
    )
  }

  async createSession(input: {
    id: string
    accountId: string
    tokenHash: string
    installationId: string
    expiresAt: Date
  }): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        input.accountId,
      ])
      await client.query(
        `UPDATE account_sessions
         SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [input.accountId],
      )
      await client.query(
        `INSERT INTO account_sessions (id, user_id, token_hash, installation_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          input.id,
          input.accountId,
          input.tokenHash,
          input.installationId,
          input.expiresAt,
        ],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
