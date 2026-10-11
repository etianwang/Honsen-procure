import { describe, expect, it } from 'vitest'
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

  async findAccountByUsername() {
    return account
  }

  async findActiveSession(tokenHash: string) {
    return this.sessions.includes(tokenHash) ? account : null
  }

  async registerFailedLogin() {}
  async registerSuccessfulLogin() {}

  async createSession(input: { tokenHash: string }) {
    this.sessions.push(input.tokenHash)
  }
}

class SyncFixture implements SyncStore {
  pushed = 0

  async pushEvent(input: Parameters<SyncStore['pushEvent']>[0]) {
    this.pushed += 1
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

  async getEntityPayload() {
    return null
  }
}

function captchaAnswer(question: string): string {
  const [left, right] = question.match(/\d+/g) ?? []
  return String(Number(left) + Number(right))
}

describe('sync API', () => {
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
    await app.close()
  })
})
