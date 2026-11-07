import { describe, expect, it } from 'vitest'
import {
  accountDisplayNameSchema,
  newUsernameSchema,
  loginRequestSchema,
  loginResponseSchema,
  managedAccountUpdateSchema,
} from './auth.js'

describe('account identity compatibility', () => {
  it('validates versioned account changes without accepting credentials or username replacement', () => {
    expect(
      managedAccountUpdateSchema.parse({
        expectedAccountVersion: '123',
        displayName: ' 合成姓名 ',
        isEnabled: false,
      }).displayName,
    ).toBe('合成姓名')
    for (const value of [
      { expectedAccountVersion: '123' },
      { expectedAccountVersion: '123', username: 'Renamed' },
      { expectedAccountVersion: '123', password: 'synthetic' },
      { expectedAccountVersion: '123', roles: ['super_administrator'] },
      { expectedAccountVersion: '123', roles: [] },
      { expectedAccountVersion: 'invalid', unlock: true },
      { expectedAccountVersion: '123', unlock: false },
    ])
      expect(managedAccountUpdateSchema.safeParse(value).success).toBe(false)
    expect(
      managedAccountUpdateSchema.safeParse({
        expectedAccountVersion: '123',
        roles: ['engineer', 'viewer'],
        unlock: true,
      }).success,
    ).toBe(true)
  })
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
