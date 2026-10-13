import { z } from 'zod'
import { uuidSchema, type Role } from '@honsen/shared'

const scopeSchema = z.object({
  projectId: uuidSchema,
  departmentId: uuidSchema,
  teamId: uuidSchema,
})

export type AuthorizationScope = z.infer<typeof scopeSchema> & {
  countryId: string
  site: string
  currency: string
  languagePair: string
}

export type AuthorizationStore = {
  listScopes(accountId: string): Promise<AuthorizationScope[]>
  saveScope(input: {
    accountId: string
    scope: z.infer<typeof scopeSchema>
    actorId: string
  }): Promise<AuthorizationScope>
  revokeScope(input: {
    accountId: string
    scope: z.infer<typeof scopeSchema>
    actorId: string
  }): Promise<void>
}

export class AuthorizationError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_SCOPE') {
    super(code)
  }
}

export class AuthorizationService {
  constructor(private readonly store: AuthorizationStore) {}

  async list(actor: { id: string }): Promise<AuthorizationScope[]> {
    return this.store.listScopes(actor.id)
  }

  async save(
    actor: { id: string; roles: Role[] },
    accountId: string,
    input: unknown,
  ): Promise<AuthorizationScope> {
    if (
      !actor.roles.some(
        (role) => role === 'administrator' || role === 'super_administrator',
      )
    ) {
      throw new AuthorizationError('FORBIDDEN')
    }
    const parsed = scopeSchema.safeParse(input)
    if (!parsed.success) throw new AuthorizationError('INVALID_SCOPE')
    return this.store.saveScope({
      accountId,
      scope: parsed.data,
      actorId: actor.id,
    })
  }

  async revoke(
    actor: { id: string; roles: Role[] },
    accountId: string,
    input: unknown,
  ): Promise<void> {
    if (
      !actor.roles.some(
        (role) => role === 'administrator' || role === 'super_administrator',
      )
    ) {
      throw new AuthorizationError('FORBIDDEN')
    }
    const parsed = scopeSchema.safeParse(input)
    if (!parsed.success) throw new AuthorizationError('INVALID_SCOPE')
    await this.store.revokeScope({
      accountId,
      scope: parsed.data,
      actorId: actor.id,
    })
  }
}
