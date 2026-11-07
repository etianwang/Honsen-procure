import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { newUsernameSchema, accountDisplayNameSchema } from '@honsen/shared'
import { AuthService, AuthenticationError, hashToken } from './service.js'

const scopeSchema = z
  .object({ projectId: z.uuid(), departmentId: z.uuid(), teamId: z.uuid() })
  .strict()
const createSchema = z
  .object({
    username: newUsernameSchema,
    displayName: accountDisplayNameSchema,
    temporaryPassword: z.string().min(8).max(1024),
    roles: z
      .array(z.enum(['administrator', 'purchaser', 'engineer', 'viewer']))
      .min(1)
      .max(4),
    uiLocale: z.enum(['zh-CN', 'fr-FR', 'en-US']),
    // Approved built-in avatar; this is not a COS employee-photo reference.
    employeePhotoKey: z.literal('builtin:default-avatar:v1'),
    scope: scopeSchema,
  })
  .strict()

export function registerAccounts(
  app: FastifyInstance,
  auth: AuthService,
  pool: Pool,
) {
  app.addHook('preHandler', async (request, reply) => {
    const path = request.routeOptions.url
    if (
      !path?.startsWith('/api/') ||
      [
        '/api/auth/login',
        '/api/auth/captcha',
        '/api/auth/change-password',
      ].includes(path)
    )
      return
    const token = /^Bearer (.+)$/.exec(
      String(request.headers.authorization ?? ''),
    )?.[1]
    if (!token) return reply.code(401).send({ code: 'UNAUTHENTICATED' })
    try {
      const actor = await auth.authenticate(token)
      if (actor.requiresPasswordChange)
        return reply.code(403).send({ code: 'PASSWORD_CHANGE_REQUIRED' })
    } catch (error) {
      if (error instanceof AuthenticationError)
        return reply.code(401).send({ code: 'UNAUTHENTICATED' })
      throw error
    }
  })
  app.route({
    method: ['GET', 'POST'],
    url: '/api/accounts',
    handler: async (request, reply) => {
      const token = /^Bearer (.+)$/.exec(
        String(request.headers.authorization ?? ''),
      )?.[1]
      if (!token) return reply.code(401).send({ code: 'UNAUTHENTICATED' })
      try {
        const actor = await auth.authenticate(token)
        const privileged = actor.roles.includes('super_administrator')
        if (
          actor.requiresPasswordChange ||
          (!privileged && !actor.roles.includes('administrator'))
        )
          return reply.code(403).send({ code: 'FORBIDDEN' })
        if (request.method === 'GET') {
          const query = z
            .object({ username: z.string().min(1).max(100) })
            .strict()
            .parse(request.query)
          const result = await pool.query(
            `SELECT u.id,u.username,COALESCE(u.display_name,u.username) AS "displayName",u.is_enabled AS "isEnabled",u.requires_password_change AS "requiresPasswordChange",ARRAY(SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role) AS roles FROM users u WHERE translate(u.username,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate($1,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') AND ($2::boolean OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('super_administrator','administrator','purchaser')) AND EXISTS(SELECT 1 FROM user_project_scope_bindings target JOIN user_project_scope_bindings own ON own.project_id=target.project_id AND own.department_id=target.department_id AND own.team_id=target.team_id AND own.deleted_at IS NULL WHERE target.user_id=u.id AND own.user_id=$3 AND target.deleted_at IS NULL))`,
            [query.username, privileged, actor.id],
          )
          return result.rows
        }
        const input = createSchema.parse(request.body)
        if (
          !privileged &&
          input.roles.some(
            (role) => role === 'administrator' || role === 'purchaser',
          )
        )
          return reply.code(403).send({ code: 'FORBIDDEN' })
        const hash = await argon2.hash(input.temporaryPassword, {
          type: argon2.argon2id,
        })
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const current = await client.query<{ roles: string[] }>(
            `SELECT ARRAY(SELECT role FROM user_roles WHERE user_id=u.id) AS roles FROM users u WHERE u.id=$1 AND u.is_enabled AND u.deleted_at IS NULL AND NOT u.requires_password_change AND EXISTS(SELECT 1 FROM account_sessions s WHERE s.user_id=u.id AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW()) FOR UPDATE`,
            [actor.id, hashToken(token)],
          )
          const currentRoles = current.rows[0]?.roles ?? []
          const currentPrivileged = currentRoles.includes('super_administrator')
          if (
            (!currentPrivileged && !currentRoles.includes('administrator')) ||
            (!currentPrivileged &&
              input.roles.some(
                (role) => role === 'administrator' || role === 'purchaser',
              ))
          ) {
            await client.query('ROLLBACK')
            return reply.code(403).send({ code: 'FORBIDDEN' })
          }
          const scope = input.scope
          const valid = await client.query(
            `SELECT 1 FROM projects p JOIN countries c ON c.id=p.country_id AND c.is_active AND c.deleted_at IS NULL JOIN departments d ON d.id=$2 AND d.is_active AND d.deleted_at IS NULL JOIN teams t ON t.id=$3 AND t.department_id=d.id AND t.is_active AND t.deleted_at IS NULL WHERE p.id=$1 AND p.is_active AND p.deleted_at IS NULL AND ($4::boolean OR EXISTS(SELECT 1 FROM user_project_scope_bindings b JOIN user_project_bindings pb ON pb.user_id=b.user_id AND pb.project_id=b.project_id AND pb.deleted_at IS NULL WHERE b.user_id=$5 AND b.project_id=p.id AND b.department_id=d.id AND b.team_id=t.id AND b.deleted_at IS NULL))`,
            [
              scope.projectId,
              scope.departmentId,
              scope.teamId,
              currentPrivileged,
              actor.id,
            ],
          )
          if (valid.rowCount !== 1) {
            await client.query('ROLLBACK')
            return reply.code(403).send({ code: 'INVALID_SCOPE' })
          }
          const id = randomUUID()
          await client.query(
            'INSERT INTO users(id,business_code,username,password_hash,ui_locale,employee_photo_key,display_name,requires_password_change) VALUES($1,$2,$3,$4,$5,$6,$7,TRUE)',
            [
              id,
              id,
              input.username,
              hash,
              input.uiLocale,
              input.employeePhotoKey,
              input.displayName,
            ],
          )
          for (const role of new Set(input.roles))
            await client.query(
              'INSERT INTO user_roles(user_id,role) VALUES($1,$2)',
              [id, role],
            )
          await client.query(
            'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
            [id, scope.projectId],
          )
          await client.query(
            'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
            [id, scope.projectId, scope.departmentId, scope.teamId],
          )
          await client.query(
            "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action) VALUES($1,$2,'user',$3,'account_created')",
            [randomUUID(), actor.id, id],
          )
          await client.query('COMMIT')
          return reply.code(201).send({
            id,
            username: input.username,
            displayName: input.displayName,
            roles: [...new Set(input.roles)],
            isEnabled: true,
            requiresPasswordChange: true,
            scopes: [scope],
          })
        } catch (error) {
          await client.query('ROLLBACK')
          if ((error as { code?: string }).code === '23505')
            return reply.code(409).send({ code: 'ACCOUNT_EXISTS' })
          throw error
        } finally {
          client.release()
        }
      } catch (error) {
        if (error instanceof AuthenticationError)
          return reply.code(401).send({ code: 'UNAUTHENTICATED' })
        if (error instanceof z.ZodError)
          return reply.code(400).send({ code: 'INVALID_REQUEST' })
        throw error
      }
    },
  })
}
