import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { AuthService } from './service.js'
import type { AuthStore, LoginAccount } from './types.js'
import {
  MasterDataService,
  type MasterDataStore,
} from '../master-data/service.js'

const account: LoginAccount = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'test-admin',
  passwordHash: 'fixture-hash',
  roles: ['super_administrator'],
  locale: 'zh-CN',
  isEnabled: true,
  lockedUntil: null,
  requiresPasswordChange: true,
}

class FixtureStore implements AuthStore {
  failures = 0
  sessions: Array<{ accountId: string; tokenHash: string }> = []
  locked = false

  async findAccountByUsername(username: string): Promise<LoginAccount | null> {
    return username === account.username
      ? {
          ...account,
          lockedUntil: this.locked ? new Date(Date.now() + 60_000) : null,
        }
      : null
  }

  async findActiveSession(tokenHash: string): Promise<LoginAccount | null> {
    return this.sessions.some((session) => session.tokenHash === tokenHash)
      ? account
      : null
  }

  async registerFailedLogin(): Promise<void> {
    this.failures += 1
  }

  async registerSuccessfulLogin(): Promise<void> {}

  async createSession(input: {
    accountId: string
    tokenHash: string
  }): Promise<void> {
    this.sessions.push(input)
  }
}

function captchaAnswer(question: string): string {
  const [left, right] = question.match(/\d+/g) ?? []
  return String(Number(left) + Number(right))
}

describe('authentication API', () => {
  it('issues a CAPTCHA and starts an account session after valid credentials', async () => {
    const store = new FixtureStore()
    const app = createApp(new AuthService(store, { verify: async () => true }))
    const captcha = await app.inject({
      method: 'GET',
      url: '/api/auth/captcha',
    })
    const challenge = captcha.json<{ id: string; question: string }>()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-installation-id': '00000000-0000-4000-8000-000000000099' },
      payload: {
        username: account.username,
        password: 'fixture-password',
        captchaId: challenge.id,
        captchaAnswer: captchaAnswer(challenge.question),
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().user.username).toBe(account.username)
    expect(store.sessions).toHaveLength(1)
    await app.close()
  })

  it('rejects a wrong CAPTCHA before verifying credentials', async () => {
    const store = new FixtureStore()
    const app = createApp(new AuthService(store, { verify: async () => true }))
    const captcha = (
      await app.inject({ method: 'GET', url: '/api/auth/captcha' })
    ).json<{ id: string }>()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-installation-id': '00000000-0000-4000-8000-000000000099' },
      payload: {
        username: account.username,
        password: 'fixture-password',
        captchaId: captcha.id,
        captchaAnswer: '0',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(store.sessions).toHaveLength(0)
    await app.close()
  })

  it('returns locked status without creating a session', async () => {
    const store = new FixtureStore()
    store.locked = true
    const app = createApp(new AuthService(store, { verify: async () => true }))
    const challenge = (
      await app.inject({ method: 'GET', url: '/api/auth/captcha' })
    ).json<{ id: string; question: string }>()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-installation-id': '00000000-0000-4000-8000-000000000099' },
      payload: {
        username: account.username,
        password: 'fixture-password',
        captchaId: challenge.id,
        captchaAnswer: captchaAnswer(challenge.question),
      },
    })

    expect(response.statusCode).toBe(423)
    await app.close()
  })
})

class FixtureMasterDataStore implements MasterDataStore {
  saved = 0
  referenceSaved = 0
  taxTemplateSaved = 0
  exchangeRateSaved = 0

  async saveProjectDefaults(
    defaults: Parameters<MasterDataStore['saveProjectDefaults']>[0],
  ) {
    this.saved += 1
    return defaults
  }

  async saveReferenceData(
    record: Parameters<MasterDataStore['saveReferenceData']>[0],
  ) {
    this.referenceSaved += 1
    return record
  }

  async saveTaxTemplate(
    template: Parameters<MasterDataStore['saveTaxTemplate']>[0],
  ) {
    this.taxTemplateSaved += 1
    return template
  }

  async saveExchangeRate(
    rate: Parameters<MasterDataStore['saveExchangeRate']>[0],
  ) {
    this.exchangeRateSaved += 1
    return rate
  }
}

describe('master-data API', () => {
  it('requires an authenticated authorized user to save project defaults', async () => {
    const authStore = new FixtureStore()
    const masterDataStore = new FixtureMasterDataStore()
    const app = createApp(
      new AuthService(authStore, { verify: async () => true }),
      new MasterDataService(masterDataStore),
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
    const response = await app.inject({
      method: 'PUT',
      url: '/api/master-data/project-defaults',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId: '00000000-0000-4000-8000-000000000002',
        departmentTitle: 'fixture department',
        companyAddress: 'fixture address',
        companyContact: 'fixture contact',
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(masterDataStore.saved).toBe(1)
    const reference = await app.inject({
      method: 'PUT',
      url: '/api/master-data/reference',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: 'country',
        id: '00000000-0000-4000-8000-000000000003',
        businessCode: 'CI',
        name: 'fixture country',
        timeZone: 'Africa/Abidjan',
        isActive: true,
      },
    })
    expect(reference.statusCode).toBe(200)
    expect(masterDataStore.referenceSaved).toBe(1)
    const taxTemplate = await app.inject({
      method: 'PUT',
      url: '/api/master-data/tax-templates',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: '00000000-0000-4000-8000-000000000004',
        businessCode: 'FIXTURE-TAX',
        name: 'fixture tax',
        countryId: null,
        rateBasisPoints: 1234,
        effectiveAt: '2026-10-10',
        isActive: true,
      },
    })
    expect(taxTemplate.statusCode).toBe(200)
    expect(masterDataStore.taxTemplateSaved).toBe(1)
    const rejectedManualRate = await app.inject({
      method: 'PUT',
      url: '/api/master-data/exchange-rates',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: '00000000-0000-4000-8000-000000000005',
        fromCurrency: 'EUR',
        toCurrency: 'XOF',
        rateDecimal: '1.25',
        effectiveAt: '2026-10-10',
        source: 'manual',
        reason: null,
      },
    })
    expect(rejectedManualRate.statusCode).toBe(400)
    expect(masterDataStore.exchangeRateSaved).toBe(0)
    const manualRate = await app.inject({
      method: 'PUT',
      url: '/api/master-data/exchange-rates',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: '00000000-0000-4000-8000-000000000005',
        fromCurrency: 'EUR',
        toCurrency: 'XOF',
        rateDecimal: '1.25',
        effectiveAt: '2026-10-10',
        source: 'manual',
        reason: 'fixture fallback',
      },
    })
    expect(manualRate.statusCode).toBe(200)
    expect(masterDataStore.exchangeRateSaved).toBe(1)
    const denied = await app.inject({
      method: 'PUT',
      url: '/api/master-data/project-defaults',
      payload: {},
    })
    expect(denied.statusCode).toBe(400)
    await app.close()
  })
})
