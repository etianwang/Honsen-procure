import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { loginRequestSchema, type LoginResponse } from '@honsen/shared'
import { CaptchaStore } from './captcha.js'
import type { AuthStore, LoginAccount, PasswordVerifier } from './types.js'

const sessionLifetimeMilliseconds = 8 * 60 * 60 * 1000

export class AuthenticationError extends Error {
  constructor(public readonly code: 'INVALID_LOGIN' | 'ACCOUNT_LOCKED') {
    super(code)
  }
}

export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly passwords: PasswordVerifier,
    readonly captchas = new CaptchaStore(),
  ) {}

  async login(
    input: unknown,
    installationId: string,
    now = new Date(),
  ): Promise<LoginResponse> {
    const request = loginRequestSchema.parse(input)
    if (
      !this.captchas.consume(
        request.captchaId,
        request.captchaAnswer,
        now.getTime(),
      )
    ) {
      throw new AuthenticationError('INVALID_LOGIN')
    }

    const account = await this.store.findAccountByUsername(request.username)
    if (!account || !account.isEnabled)
      throw new AuthenticationError('INVALID_LOGIN')
    if (account.lockedUntil && account.lockedUntil > now)
      throw new AuthenticationError('ACCOUNT_LOCKED')

    if (
      !(await this.passwords.verify(account.passwordHash, request.password))
    ) {
      await this.store.registerFailedLogin(account.id, now)
      throw new AuthenticationError('INVALID_LOGIN')
    }

    await this.store.registerSuccessfulLogin(account.id)
    const accessToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + sessionLifetimeMilliseconds)
    await this.store.createSession({
      id: randomUUID(),
      accountId: account.id,
      tokenHash: hashToken(accessToken),
      installationId,
      expiresAt,
    })

    return {
      accessToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: account.id,
        username: account.username,
        roles: account.roles,
        locale: account.locale,
        requiresPasswordChange: account.requiresPasswordChange,
      },
    }
  }

  async authenticate(
    accessToken: string,
    now = new Date(),
  ): Promise<LoginAccount> {
    const account = await this.store.findActiveSession(
      hashToken(accessToken),
      now,
    )
    if (!account || !account.isEnabled) {
      throw new AuthenticationError('INVALID_LOGIN')
    }
    return account
  }
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
