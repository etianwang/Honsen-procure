import { describe, expect, it } from 'vitest'
import { AuthorizationService, type AuthorizationStore } from './service.js'

const scope = {
  projectId: '00000000-0000-4000-8000-000000000002',
  departmentId: '00000000-0000-4000-8000-000000000003',
  teamId: '00000000-0000-4000-8000-000000000004',
  countryId: '00000000-0000-4000-8000-000000000005',
  site: 'Bethel',
  currency: 'XOF',
  languagePair: 'zh_fr',
}

class FixtureStore implements AuthorizationStore {
  saved = 0
  revoked = 0
  async listScopes() {
    return [scope]
  }
  async saveScope(input: Parameters<AuthorizationStore['saveScope']>[0]) {
    this.saved += 1
    return { ...scope, ...input.scope }
  }
  async revokeScope(_input: Parameters<AuthorizationStore['revokeScope']>[0]) {
    this.revoked += 1
  }
}

describe('authorization service', () => {
  it('allows only administrators to grant a validated scoped project binding', async () => {
    const store = new FixtureStore()
    const service = new AuthorizationService(store)
    await expect(
      service.save(
        { id: '00000000-0000-4000-8000-000000000001', roles: ['engineer'] },
        '00000000-0000-4000-8000-000000000006',
        scope,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.save(
        {
          id: '00000000-0000-4000-8000-000000000001',
          roles: ['administrator'],
        },
        '00000000-0000-4000-8000-000000000006',
        { ...scope, teamId: 'bad' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SCOPE' })
    await expect(
      service.save(
        {
          id: '00000000-0000-4000-8000-000000000001',
          roles: ['administrator'],
        },
        '00000000-0000-4000-8000-000000000006',
        scope,
      ),
    ).resolves.toMatchObject(scope)
    expect(store.saved).toBe(1)
  })

  it('allows only administrators to revoke a validated scoped project binding', async () => {
    const store = new FixtureStore()
    const service = new AuthorizationService(store)
    await expect(
      service.revoke(
        { id: '00000000-0000-4000-8000-000000000001', roles: ['engineer'] },
        '00000000-0000-4000-8000-000000000006',
        scope,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.revoke(
        {
          id: '00000000-0000-4000-8000-000000000001',
          roles: ['administrator'],
        },
        '00000000-0000-4000-8000-000000000006',
        { ...scope, teamId: 'bad' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SCOPE' })
    await expect(
      service.revoke(
        {
          id: '00000000-0000-4000-8000-000000000001',
          roles: ['administrator'],
        },
        '00000000-0000-4000-8000-000000000006',
        scope,
      ),
    ).resolves.toBeUndefined()
    expect(store.revoked).toBe(1)
  })
})
