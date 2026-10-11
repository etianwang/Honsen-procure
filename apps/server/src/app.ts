import Fastify from 'fastify'
import { z } from 'zod'
import { AuthenticationError, AuthService } from './auth/service.js'
import { MasterDataError, MasterDataService } from './master-data/service.js'
import { SyncService } from './sync/service.js'

const installationHeaderSchema = z.string().uuid()
const bearerTokenSchema = z.string().regex(/^Bearer (.+)$/)

export function createApp(
  auth: AuthService,
  masterData?: MasterDataService,
  sync?: SyncService,
) {
  const app = Fastify({ logger: false })

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
        return await sync.push(account, request.body)
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
  }

  return app
}
