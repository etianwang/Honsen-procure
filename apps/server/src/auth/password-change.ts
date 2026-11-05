import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import argon2 from 'argon2'
import { z } from 'zod'
import { AuthService, AuthenticationError, hashToken } from './service.js'

const requestSchema = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(12).max(1024),
  })
  .strict()

export function registerPasswordChange(
  app: FastifyInstance,
  auth: AuthService,
  pool: Pool,
) {
  app.post('/api/auth/change-password', async (request, reply) => {
    const token = /^Bearer (.+)$/.exec(
      String(request.headers.authorization ?? ''),
    )?.[1]
    if (!token) return reply.code(401).send({ code: 'UNAUTHENTICATED' })
    const input = requestSchema.safeParse(request.body)
    if (!input.success) return reply.code(400).send({ code: 'INVALID_REQUEST' })
    const client = await pool.connect()
    try {
      const account = await auth.authenticate(token)
      if (account.lockedUntil && account.lockedUntil > new Date())
        return reply.code(423).send({ code: 'ACCOUNT_LOCKED' })
      await client.query('BEGIN')
      // Serialize against login and other password changes, then recheck session under the lock.
      const result = await client.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id=$1 AND is_enabled=TRUE AND deleted_at IS NULL FOR UPDATE',
        [account.id],
      )
      const active = await client.query(
        'SELECT 1 FROM account_sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>NOW()',
        [hashToken(token), account.id],
      )
      if (active.rowCount !== 1 || !result.rows[0]) {
        await client.query('ROLLBACK')
        return reply.code(401).send({ code: 'UNAUTHENTICATED' })
      }
      if (
        !(await argon2.verify(
          result.rows[0].password_hash,
          input.data.currentPassword,
        ))
      ) {
        await client.query(
          "UPDATE users SET failed_login_attempts=failed_login_attempts+1,locked_until=CASE WHEN failed_login_attempts+1>=5 THEN NOW()+interval '15 minutes' ELSE locked_until END WHERE id=$1",
          [account.id],
        )
        await client.query('COMMIT')
        return reply.code(401).send({ code: 'INVALID_LOGIN' })
      }
      if (input.data.currentPassword === input.data.newPassword) {
        await client.query('ROLLBACK')
        return reply.code(400).send({ code: 'PASSWORD_UNCHANGED' })
      }
      const hash = await argon2.hash(input.data.newPassword, {
        type: argon2.argon2id,
      })
      await client.query(
        'UPDATE users SET password_hash=$2, requires_password_change=FALSE, updated_at=NOW() WHERE id=$1',
        [account.id, hash],
      )
      await client.query(
        'UPDATE account_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',
        [account.id],
      )
      await client.query(
        "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES(gen_random_uuid(),$1,'user',$1,'password_changed','Self-service password change')",
        [account.id],
      )
      await client.query('COMMIT')
      return { code: 'PASSWORD_CHANGED', requiresLogin: true }
    } catch (error) {
      await client.query('ROLLBACK')
      if (error instanceof AuthenticationError)
        return reply.code(401).send({ code: 'UNAUTHENTICATED' })
      throw error
    } finally {
      client.release()
    }
  })
}
