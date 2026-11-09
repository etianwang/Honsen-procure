import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { managedAccountUpdateSchema } from '@honsen/shared'
import { AuthorizationError } from '../authorization/service.js'
import { PostgresAuthorizationStore } from '../authorization/postgres-store.js'
import { AuthService, AuthenticationError, hashToken } from './service.js'

export function registerManagedAccountLifecycle(
  app: FastifyInstance,
  auth: AuthService,
  pool: Pool,
) {
  const authorization = new PostgresAuthorizationStore(pool)
  app.route({
    method: ['GET', 'PATCH'],
    url: '/api/accounts/:accountId',
    handler: async (request, reply) => {
      const token = /^Bearer (.+)$/.exec(
        String(request.headers.authorization ?? ''),
      )?.[1]
      if (!token) return reply.code(401).send({ code: 'UNAUTHENTICATED' })
      try {
        const actor = await auth.authenticate(token)
        const { accountId } = z
          .object({ accountId: z.uuid() })
          .parse(request.params)
        const input =
          request.method === 'PATCH'
            ? managedAccountUpdateSchema.parse(request.body)
            : null
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const state = await authorization.lockManagedAccount(
            client,
            actor.id,
            accountId,
            hashToken(token),
          )
          if (!state) {
            await client.query('ROLLBACK')
            return reply.code(404).send({ code: 'ACCOUNT_NOT_FOUND' })
          }
          const { target, roles, privileged } = state
          let accountVersion = target.account_version
          let nextRoles = roles
          if (input) {
            if (input.expectedAccountVersion !== accountVersion) {
              await client.query('ROLLBACK')
              return reply.code(409).send({ code: 'ACCOUNT_CONFLICT' })
            }
            nextRoles = [...new Set(input.roles ?? roles)].sort()
            if (
              !privileged &&
              nextRoles.some(
                (role) => role === 'administrator' || role === 'purchaser',
              )
            )
              throw new AuthorizationError('FORBIDDEN')
            const rolesChanged =
              JSON.stringify(nextRoles) !== JSON.stringify(roles)
            const enabledChanged =
              input.isEnabled !== undefined &&
              input.isEnabled !== target.is_enabled
            const update = await client.query<{ account_version: string }>(
              `UPDATE users SET display_name=COALESCE($2,display_name),ui_locale=COALESCE($3,ui_locale),is_enabled=COALESCE($4,is_enabled),failed_login_attempts=CASE WHEN $5 THEN 0 ELSE failed_login_attempts END,locked_until=CASE WHEN $5 THEN NULL ELSE locked_until END,updated_at=NOW() WHERE id=$1 RETURNING xmin::text AS account_version`,
              [
                accountId,
                input.displayName ?? null,
                input.uiLocale ?? null,
                input.isEnabled ?? null,
                input.unlock === true,
              ],
            )
            accountVersion = update.rows[0]!.account_version
            if (rolesChanged) {
              await client.query(
                'DELETE FROM user_roles WHERE user_id=$1 AND NOT(role=ANY($2::text[]))',
                [accountId, nextRoles],
              )
              for (const role of nextRoles)
                await client.query(
                  'INSERT INTO user_roles(user_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING',
                  [accountId, role],
                )
            }
            if (rolesChanged || enabledChanged)
              await client.query(
                'UPDATE account_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',
                [accountId],
              )
            await client.query(
              "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES(gen_random_uuid(),$1,'user',$2,'account_updated',$3)",
              [
                actor.id,
                accountId,
                JSON.stringify({
                  fields: Object.keys(input).filter(
                    (key) => key !== 'expectedAccountVersion',
                  ),
                  previous: {
                    displayName: target.display_name,
                    uiLocale: target.ui_locale,
                    roles,
                    isEnabled: target.is_enabled,
                  },
                  next: {
                    displayName: input.displayName ?? target.display_name,
                    uiLocale: input.uiLocale ?? target.ui_locale,
                    roles: nextRoles,
                    isEnabled: input.isEnabled ?? target.is_enabled,
                  },
                  unlock: input.unlock === true,
                }),
              ],
            )
          }
          await client.query('COMMIT')
          return {
            id: accountId,
            username: target.username,
            displayName:
              input?.displayName ?? target.display_name ?? target.username,
            uiLocale: input?.uiLocale ?? target.ui_locale,
            roles: nextRoles,
            isEnabled: input?.isEnabled ?? target.is_enabled,
            requiresPasswordChange: target.requires_password_change,
            isLocked:
              input?.unlock === true
                ? false
                : !!target.locked_until && target.locked_until > new Date(),
            accountVersion,
          }
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      } catch (error) {
        if (error instanceof AuthenticationError)
          return reply.code(401).send({ code: 'UNAUTHENTICATED' })
        if (error instanceof AuthorizationError)
          return reply.code(403).send({ code: 'FORBIDDEN' })
        if (error instanceof z.ZodError)
          return reply.code(400).send({ code: 'INVALID_REQUEST' })
        throw error
      }
    },
  })
}
