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
  replaced = 0
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
  async replaceScope(input: Parameters<AuthorizationStore['replaceScope']>[0]) {
    this.replaced += 1
    return { ...scope, ...input.newScope }
  }
}

describe('authorization service', () => {
  it("restricts another account's authorization query to administrators", async () => {
    const service = new AuthorizationService(new FixtureStore())
    const accountId = '00000000-0000-4000-8000-000000000006'
    await expect(
      service.listForAccount({ id: accountId, roles: ['engineer'] }, accountId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.listForAccount(
        { id: accountId, roles: ['administrator'] },
        accountId,
      ),
    ).resolves.toEqual([scope])
  })
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

  it('requires admin and two valid scopes to modify a binding', async () => {
    const store = new FixtureStore()
    const service = new AuthorizationService(store)
    const accountId = '00000000-0000-4000-8000-000000000006'
    const change = {
      oldScope: scope,
      newScope: { ...scope, teamId: '00000000-0000-4000-8000-000000000007' },
    }
    await expect(
      service.replace(
        { id: accountId, roles: ['engineer'] },
        accountId,
        change,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.replace({ id: accountId, roles: ['administrator'] }, accountId, {
        ...change,
        newScope: { ...scope, teamId: 'bad' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCOPE' })
    await expect(
      service.replace(
        { id: accountId, roles: ['administrator'] },
        accountId,
        change,
      ),
    ).resolves.toMatchObject(change.newScope)
    expect(store.replaced).toBe(1)
  })
})
