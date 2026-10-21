import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { createApp } from '../app.js'
import { AuthService } from '../auth/service.js'
import type { AuthStore, LoginAccount } from '../auth/types.js'
import { SyncService } from './service.js'
import type { SyncStore } from './types.js'

const account: LoginAccount = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'sync-purchaser',
  passwordHash: 'fixture-hash',
  roles: ['purchaser'],
  locale: 'zh-CN',
  isEnabled: true,
  lockedUntil: null,
  requiresPasswordChange: false,
}

class AuthFixture implements AuthStore {
  sessions: string[] = []

  constructor(private readonly loginAccount: LoginAccount = account) {}

  async findAccountByUsername() {
    return this.loginAccount
  }

  async findActiveSession(tokenHash: string) {
    return this.sessions.includes(tokenHash)
      ? {
          ...this.loginAccount,
          installationId: '00000000-0000-4000-8000-000000000099',
        }
      : null
  }

  async registerFailedLogin() {}
  async registerSuccessfulLogin() {}

  async createSession(input: { tokenHash: string }) {
    this.sessions.push(input.tokenHash)
  }
}

class SyncFixture implements SyncStore {
  pushed = 0
  lastInstallationId: string | null = null

  async pushEvent(input: Parameters<SyncStore['pushEvent']>[0]) {
    this.pushed += 1
    this.lastInstallationId = input.installationId
    return {
      eventId: input.event.eventId,
      status: 'accepted' as const,
      serverVersion: 1,
    }
  }

  async pullChanges() {
    return { changes: [], nextCursor: '0' }
  }

  async hasActiveProjectBinding() {
    return true
  }

  async hasProjectBusinessUse() {
    return false
  }

  async isCompatibleProjectTax() {
    return true
  }

  async getEntityPayload() {
    return null
  }
}

function captchaAnswer(question: string): string {
  const [left, right] = question.match(/\d+/g) ?? []
  return String(Number(left) + Number(right))
}

describe('sync API', () => {
  it('rejects category repair requests without an authenticated administrator', async () => {
    const authStore = new AuthFixture()
    const app = createApp(
      new AuthService(authStore, { verify: async () => true }),
      undefined,
      new SyncService(new SyncFixture()),
    )
    try {
      const payload = {
        requestId: '00000000-0000-4000-8000-000000000061',
        categoryId: '00000000-0000-4000-8000-000000000062',
        expectedVersion: 1,
        newBusinessCode: 'CAT-REPAIRED',
        reason: 'duplicate code',
      }
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/sync/category-repairs',
        payload,
      })
      expect(anonymous.statusCode).toBe(401)
      const captcha = (
        await app.inject({ method: 'GET', url: '/api/auth/captcha' })
      ).json<{ id: string; question: string }>()
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          'x-installation-id': '00000000-0000-4000-8000-000000000099',
        },
        payload: {
          username: account.username,
          password: 'fixture-password',
          captchaId: captcha.id,
          captchaAnswer: captchaAnswer(captcha.question),
        },
      })
      const token = login.json<{ accessToken: string }>().accessToken
      const forbidden = await app.inject({
        method: 'POST',
        url: '/api/sync/category-repairs',
        headers: { authorization: `Bearer ${token}` },
        payload,
      })
      expect(forbidden.statusCode).toBe(403)
    } finally {
      await app.close()
    }
  })

  it('rejects an authenticated engineer formal issue before store mutation', async () => {
    const engineer = {
      ...account,
      id: '00000000-0000-4000-8000-000000000051',
      username: 'formal-engineer',
      roles: ['engineer' as const],
    }
    const authStore = new AuthFixture(engineer)
    const syncStore = new SyncFixture()
    const app = createApp(
      new AuthService(authStore, { verify: async () => true }),
      undefined,
      new SyncService(syncStore),
    )
    try {
      const captcha = (
        await app.inject({ method: 'GET', url: '/api/auth/captcha' })
      ).json<{ id: string; question: string }>()
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          'x-installation-id': '00000000-0000-4000-8000-000000000099',
        },
        payload: {
          username: engineer.username,
          password: 'fixture-password',
          captchaId: captcha.id,
          captchaAnswer: captchaAnswer(captcha.question),
        },
      })
      const token = login.json<{ accessToken: string }>().accessToken
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          deviceId: '00000000-0000-4000-8000-000000000098',
          events: [
            {
              eventId: '00000000-0000-4000-8000-000000000052',
              entityType: 'purchase_order',
              entityId: '00000000-0000-4000-8000-000000000053',
              operation: 'upsert',
              baseVersion: 0,
              payload: {
                projectId: '00000000-0000-4000-8000-000000000054',
                departmentId: '00000000-0000-4000-8000-000000000055',
                teamId: '00000000-0000-4000-8000-000000000056',
                applicantId: engineer.id,
                workflowStatus: 'formally_issued',
                formalDocumentNo: 'FORGED',
              },
            },
          ],
        },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().results[0].status).toBe('validation_error')
      expect(syncStore.pushed).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('registers the authenticated WebSocket hint route', async () => {
    const app = createApp(
      new AuthService(new AuthFixture(), { verify: async () => true }),
      undefined,
      new SyncService(new SyncFixture()),
    )
    await app.ready()
    expect(app.hasRoute({ method: 'GET', url: '/api/sync/ws' })).toBe(true)
    await app.close()
  })

  it('notifies authenticated WebSocket clients after an accepted push', async () => {
    const authStore = new AuthFixture()
    const app = createApp(
      new AuthService(authStore, { verify: async () => true }),
      undefined,
      new SyncService(new SyncFixture()),
    )
    const captcha = (
      await app.inject({ method: 'GET', url: '/api/auth/captcha' })
    ).json<{ id: string; question: string }>()
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-installation-id': '00000000-0000-4000-8000-000000000099' },
      payload: {
        username: account.username,
        password: 'fixture-password',
        captchaId: captcha.id,
        captchaAnswer: captchaAnswer(captcha.question),
      },
    })
    const token = login.json<{ accessToken: string }>().accessToken
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    const socket = new WebSocket(
      `${address.replace(/^http/, 'ws')}/api/sync/ws`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    )

    try {
      await once(socket, 'open')
      const message = once(socket, 'message')
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          deviceId: '00000000-0000-4000-8000-000000000098',
          events: [
            {
              eventId: '00000000-0000-4000-8000-000000000003',
              entityType: 'material',
              entityId: '00000000-0000-4000-8000-000000000004',
              operation: 'upsert',
              baseVersion: 0,
              payload: {},
            },
          ],
        },
      })

      expect(response.statusCode).toBe(200)
      const [hint] = await message
      expect(JSON.parse(hint.toString())).toEqual({ type: 'dataset-changed' })
    } finally {
      socket.close()
      await app.close()
    }
  })

  it('requires a session and accepts a bounded push through the HTTPS boundary', async () => {
    const authStore = new AuthFixture()
    const syncStore = new SyncFixture()
    const app = createApp(
      new AuthService(authStore, { verify: async () => true }),
      undefined,
      new SyncService(syncStore),
    )
    const captcha = (
      await app.inject({ method: 'GET', url: '/api/auth/captcha' })
    ).json<{ id: string; question: string }>()
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-installation-id': '00000000-0000-4000-8000-000000000099' },
      payload: {
        username: account.username,
        password: 'fixture-password',
        captchaId: captcha.id,
        captchaAnswer: captchaAnswer(captcha.question),
      },
    })
    const token = login.json<{ accessToken: string }>().accessToken
    const body = {
      deviceId: '00000000-0000-4000-8000-000000000098',
      events: [
        {
          eventId: '00000000-0000-4000-8000-000000000003',
          entityType: 'material',
          entityId: '00000000-0000-4000-8000-000000000004',
          operation: 'upsert',
          baseVersion: 0,
          payload: {},
        },
      ],
    }

    const denied = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      payload: body,
    })
    expect(denied.statusCode).toBe(400)

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().results[0].status).toBe('accepted')
    expect(syncStore.pushed).toBe(1)
    expect(syncStore.lastInstallationId).toBe(
      '00000000-0000-4000-8000-000000000099',
    )
    await app.close()
  })
})
