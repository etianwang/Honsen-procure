import { z } from 'zod'

export const roleSchema = z.enum([
  'super_administrator',
  'administrator',
  'purchaser',
  'engineer',
  'viewer',
])

export type Role = z.infer<typeof roleSchema>

export const uiLocaleSchema = z.enum(['zh-CN', 'fr-FR', 'en-US'])
export type UiLocale = z.infer<typeof uiLocaleSchema>

export const uuidSchema = z.uuid()
