import { describe, it, expect } from 'vitest'
import { createApp } from '../app.js'
import { AuthService } from '../auth/service.js'
import type { AuthStore } from '../auth/types.js'

const authStore: AuthStore = {
  async findAccountByUsername() {
    return null
  },
  async findActiveSession() {
    return null
  },
  async registerFailedLogin() {},
  async registerSuccessfulLogin() {},
  async createSession() {},
}
describe('attachment API authorization', () => {
  it.each([
    '/api/attachments/prepare',
    '/api/attachments/00000000-0000-4000-8000-000000000001/complete',
  ])('rejects unsigned writes to %s', async (url) => {
    const app = createApp(
      new AuthService(authStore, { verify: async () => false }),
    )
    const response = await app.inject({ method: 'POST', url, payload: {} })
    expect(response.statusCode).toBe(401)
    await app.close()
  })
  it('rejects unsigned attachment downloads', async () => {
    const app = createApp(
      new AuthService(authStore, { verify: async () => false }),
    )
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/attachments/00000000-0000-4000-8000-000000000001/download',
        })
      ).statusCode,
    ).toBe(401)
    await app.close()
  })
})
