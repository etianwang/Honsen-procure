import type { Role, UiLocale } from '@honsen/shared'

export type LoginAccount = {
  id: string
  username: string
  passwordHash: string
  roles: Role[]
  locale: UiLocale
  isEnabled: boolean
  lockedUntil: Date | null
  requiresPasswordChange: boolean
}

export type AuthenticatedAccount = LoginAccount & {
  installationId: string
}

export type AuthStore = {
  findAccountByUsername(username: string): Promise<LoginAccount | null>
  findActiveSession(
    tokenHash: string,
    now: Date,
  ): Promise<AuthenticatedAccount | null>
  registerFailedLogin(accountId: string, now: Date): Promise<void>
  registerSuccessfulLogin(accountId: string): Promise<void>
  createSession(input: {
    id: string
    accountId: string
    tokenHash: string
    installationId: string
    expiresAt: Date
  }): Promise<void>
}

export type PasswordVerifier = {
  verify(hash: string, password: string): Promise<boolean>
}
