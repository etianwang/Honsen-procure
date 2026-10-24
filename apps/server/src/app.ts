import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { z } from 'zod'
import { AuthenticationError, AuthService } from './auth/service.js'
import { MasterDataError, MasterDataService } from './master-data/service.js'
import { SyncService } from './sync/service.js'
import { AttachmentService, attachmentStatus } from './attachments/service.js'
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

  for (const operation of ['prepare', 'complete', 'download'] as const) {
    app.route({
      method: operation === 'download' ? 'GET' : 'POST',
      url:
        operation === 'prepare'
          ? '/api/attachments/prepare'
          : `/api/attachments/:id/${operation}`,
      handler: async (request, reply) => {
        try {
          if (
            !bearerTokenSchema.safeParse(request.headers.authorization).success
          )
            return reply.status(401).send({ code: 'UNAUTHENTICATED' })
          const actor = await authenticateRequest(request)
          if (!attachments)
            return reply.status(503).send({ code: 'ATTACHMENTS_UNAVAILABLE' })
          if (operation === 'prepare')
            return await attachments.prepare(actor, request.body)
          const { id } = z.object({ id: z.uuid() }).parse(request.params)
          return operation === 'complete'
            ? await attachments.complete(actor, id)
            : await attachments.download(actor, id)
        } catch (error) {
          if (error instanceof AuthenticationError)
            return reply.status(401).send({ code: 'UNAUTHENTICATED' })
          if (error instanceof z.ZodError)
            return reply.status(400).send({ code: 'INVALID_REQUEST' })
          const failure = attachmentStatus(error)
          if (failure)
            return reply.status(failure.status).send({ code: failure.code })
          return reply.status(502).send({ code: 'ATTACHMENT_OPERATION_FAILED' })
        }
      },
    })
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

  return app
}
