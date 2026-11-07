import { describe, expect, it } from 'vitest'
import {
  accountDisplayNameSchema,
  newUsernameSchema,
  loginRequestSchema,
  loginResponseSchema,
} from './auth.js'

describe('account identity compatibility', () => {
  it('accepts only ASCII letters and digits for new usernames without changing case', () => {
    expect(newUsernameSchema.parse('Zhanghekai')).toBe('Zhanghekai')
    for (const value of [
      '测试1',
      'alpha-beta',
      'a_b',
      ' admin',
      'admin ',
      '',
      'A'.repeat(101),
    ])
      expect(newUsernameSchema.safeParse(value).success).toBe(false)
    expect(newUsernameSchema.parse('ceshi1')).toBe('ceshi1')
    expect(accountDisplayNameSchema.parse(' 张和凯 ')).toBe('张和凯')
    expect(accountDisplayNameSchema.safeParse(' ').success).toBe(false)
  })
  it('keeps legacy login identities and old login responses readable', () => {
    expect(
      loginRequestSchema.parse({
        username: '测试1',
        password: 'synthetic',
        captchaId: '00000000-0000-4000-8000-000000000001',
        captchaAnswer: '3',
      }).username,
    ).toBe('测试1')
    const response = {
      accessToken: 'x'.repeat(32),
      expiresAt: '2026-11-07T00:00:00.000Z',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'admin',
        roles: ['super_administrator'],
        locale: 'zh-CN',
        requiresPasswordChange: false,
      },
    }
    expect(loginResponseSchema.safeParse(response).success).toBe(true)
    expect(
      loginResponseSchema.parse({
        ...response,
        user: { ...response.user, displayName: '管理员' },
      }).user.displayName,
    ).toBe('管理员')
  })
})
