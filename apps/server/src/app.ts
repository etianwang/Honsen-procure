import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { z } from 'zod'
import { AttachmentError, AttachmentService } from './attachments/service.js'
import { AuthenticationError, AuthService } from './auth/service.js'
import { MasterDataError, MasterDataService } from './master-data/service.js'
import { SyncService } from './sync/service.js'
import {
  AuthorizationError,
  AuthorizationService,
} from './authorization/service.js'

const installationHeaderSchema = z.string().uuid()
const bearerTokenSchema = z.string().regex(/^Bearer (.+)$/)

export function createApp(
  auth: AuthService,
  masterData?: MasterDataService,
  sync?: SyncService,
  authorization?: AuthorizationService,
  attachments?: AttachmentService,
) {
  const app = Fastify({ logger: false })
  const sockets = new Set<{
    send(data: string): void
    close(code?: number): void
  }>()

  async function authenticateRequest(request: {
    headers: { authorization?: unknown }
  }) {
    const authorization = bearerTokenSchema.parse(request.headers.authorization)
    return auth.authenticate(authorization.slice(7))
  }

  app.get('/api/auth/captcha', async () => auth.captchas.issue())

  app.post('/api/auth/login', async (request, reply) => {
    try {
      const installationId = installationHeaderSchema.parse(
        request.headers['x-installation-id'],
      )
      return await auth.login(request.body, installationId)
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return reply
          .status(error.code === 'ACCOUNT_LOCKED' ? 423 : 401)
          .send({ code: error.code })
      }
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ code: 'INVALID_REQUEST' })
      }
      throw error
    }
  })

  if (authorization) {
    app.get('/api/authorization/context', async (request, reply) => {
      try {
        return await authorization.list(await authenticateRequest(request))
      } catch (error) {
        if (error instanceof AuthenticationError)
          return reply.status(401).send({ code: 'UNAUTHENTICATED' })
        throw error
      }
    })
    app.get(
      '/api/authorization/bindings/:accountId',
      async (request, reply) => {
        try {
          const account = await authenticateRequest(request)
          const params = z.object({ accountId: z.uuid() }).parse(request.params)
          return await authorization.listForAccount(account, params.accountId)
        } catch (error) {
          if (error instanceof AuthenticationError)
            return reply.status(401).send({ code: 'UNAUTHENTICATED' })
          if (error instanceof AuthorizationError)
            return reply.status(403).send({ code: error.code })
          if (error instanceof z.ZodError)
            return reply.status(400).send({ code: 'INVALID_REQUEST' })
          throw error
        }
      },
    )
    app.put(
      '/api/authorization/bindings/:accountId',
      async (request, reply) => {
        try {
          const account = await authenticateRequest(request)
          const params = z.object({ accountId: z.uuid() }).parse(request.params)
          return await authorization.save(
            account,
            params.accountId,
            request.body,
          )
        } catch (error) {
          if (error instanceof AuthenticationError)
            return reply.status(401).send({ code: 'UNAUTHENTICATED' })
          if (error instanceof AuthorizationError)
            return reply
              .status(error.code === 'FORBIDDEN' ? 403 : 400)
              .send({ code: error.code })
          if (error instanceof z.ZodError)
            return reply.status(400).send({ code: 'INVALID_REQUEST' })
          throw error
        }
      },
    )
    app.patch(
      '/api/authorization/bindings/:accountId',
      async (request, reply) => {
        try {
          const account = await authenticateRequest(request)
          const params = z.object({ accountId: z.uuid() }).parse(request.params)
          return await authorization.replace(
            account,
            params.accountId,
            request.body,
          )
        } catch (error) {
          if (error instanceof AuthenticationError)
            return reply.status(401).send({ code: 'UNAUTHENTICATED' })
          if (error instanceof AuthorizationError)
            return reply
              .status(error.code === 'FORBIDDEN' ? 403 : 400)
              .send({ code: error.code })
          if (error instanceof z.ZodError)
            return reply.status(400).send({ code: 'INVALID_REQUEST' })
          throw error
        }
      },
    )
    app.delete(
      '/api/authorization/bindings/:accountId',
      async (request, reply) => {
        try {
          const account = await authenticateRequest(request)
          const params = z.object({ accountId: z.uuid() }).parse(request.params)
          await authorization.revoke(account, params.accountId, request.body)
          return reply.status(204).send()
        } catch (error) {
          if (error instanceof AuthenticationError)
            return reply.status(401).send({ code: 'UNAUTHENTICATED' })
          if (error instanceof AuthorizationError)
            return reply
              .status(error.code === 'FORBIDDEN' ? 403 : 400)
              .send({ code: error.code })
          if (error instanceof z.ZodError)
            return reply.status(400).send({ code: 'INVALID_REQUEST' })
          throw error
        }
      },
    )
  }

  if (masterData) {
    app.put('/api/master-data/project-defaults', async (request, reply) => {
      try {
        const account = await authenticateRequest(request)
        return await masterData.saveProjectDefaults(account, request.body)
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply.status(401).send({ code: 'UNAUTHENTICATED' })
        }
        if (error instanceof MasterDataError) {
          return reply
            .status(error.code === 'FORBIDDEN' ? 403 : 400)
            .send({ code: error.code })
        }
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: 'INVALID_REQUEST' })
        }
        throw error
      }
    })

    app.put('/api/master-data/reference', async (request, reply) => {
      try {
        const account = await authenticateRequest(request)
        return await masterData.saveReferenceData(account, request.body)
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply.status(401).send({ code: 'UNAUTHENTICATED' })
        }
        if (error instanceof MasterDataError) {
          return reply
            .status(error.code === 'FORBIDDEN' ? 403 : 400)
            .send({ code: error.code })
        }
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: 'INVALID_REQUEST' })
        }
        throw error
      }
    })

    app.put('/api/master-data/tax-templates', async (request, reply) => {
      try {
        const account = await authenticateRequest(request)
        return await masterData.saveTaxTemplate(account, request.body)
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply.status(401).send({ code: 'UNAUTHENTICATED' })
        }
        if (error instanceof MasterDataError) {
          return reply
            .status(error.code === 'FORBIDDEN' ? 403 : 400)
            .send({ code: error.code })
        }
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: 'INVALID_REQUEST' })
        }
        throw error
      }
    })

    app.put('/api/master-data/exchange-rates', async (request, reply) => {
      try {
        const account = await authenticateRequest(request)
        return await masterData.saveExchangeRate(account, request.body)
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply.status(401).send({ code: 'UNAUTHENTICATED' })
        }
        if (error instanceof MasterDataError) {
          return reply
            .status(error.code === 'FORBIDDEN' ? 403 : 400)
            .send({ code: error.code })
        }
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: 'INVALID_REQUEST' })
        }
        throw error
      }
    })
  }

  if (sync) {
    app.post('/api/sync/push', async (request, reply) => {
      try {
        const account = await authenticateRequest(request)
        const response = await sync.push(account, request.body)
        if (response.results.some((result) => result.status === 'accepted')) {
          const hint = JSON.stringify({ type: 'dataset-changed' })
          for (const socket of sockets) socket.send(hint)
        }
        return response
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply.status(401).send({ code: 'UNAUTHENTICATED' })
        }
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: 'INVALID_REQUEST' })
        }
        throw error
      }
    })

    app.get('/api/sync/pull', async (request, reply) => {
      try {
        const account = await authenticateRequest(request)
        return await sync.pull(account, request.query)
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply.status(401).send({ code: 'UNAUTHENTICATED' })
        }
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: 'INVALID_REQUEST' })
        }
        throw error
      }
    })

    app.register(async (websocketApp) => {
      await websocketApp.register(websocket)
      websocketApp.get(
        '/api/sync/ws',
        { websocket: true },
        async (socket, request) => {
          try {
            await authenticateRequest(request)
            sockets.add(socket)
            socket.on('close', () => sockets.delete(socket))
          } catch {
            socket.close(1008)
          }
        },
      )
    })
  }

  if (attachments) {
    const attachmentIdSchema = z.object({ id: z.uuid() })
    function attachmentFailure(
      error: unknown,
      reply: { status(code: number): { send(body: object): unknown } },
    ) {
      if (error instanceof AuthenticationError)
        return reply.status(401).send({ code: 'UNAUTHENTICATED' })
      if (error instanceof z.ZodError)
        return reply.status(400).send({ code: 'INVALID_REQUEST' })
      if (error instanceof AttachmentError) {
        const status =
          error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'NOT_FOUND'
              ? 404
              : error.code === 'NOT_UPLOADED'
                ? 409
                : 409
        return reply.status(status).send({ code: error.code })
      }
      throw error
    }
    app.post('/api/attachments/intents', async (request, reply) => {
      try {
        return await attachments.createIntent(
          await authenticateRequest(request),
          request.body,
        )
      } catch (error) {
        return attachmentFailure(error, reply)
      }
    })
    app.post('/api/attachments/:id/complete', async (request, reply) => {
      try {
        const { id } = attachmentIdSchema.parse(request.params)
        return await attachments.complete(
          await authenticateRequest(request),
          id,
        )
      } catch (error) {
        return attachmentFailure(error, reply)
      }
    })
    app.get('/api/attachments/:id/download', async (request, reply) => {
      try {
        const { id } = attachmentIdSchema.parse(request.params)
        return await attachments.download(
          await authenticateRequest(request),
          id,
        )
      } catch (error) {
        return attachmentFailure(error, reply)
      }
    })
  }

  return app
}
