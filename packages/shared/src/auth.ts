import { z } from 'zod'
import { roleSchema, uiLocaleSchema, uuidSchema } from './contracts.js'

export const newUsernameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9]+$/)
export const accountDisplayNameSchema = z.string().trim().min(1).max(100)

export const managedAccountUpdateSchema = z
  .object({
    expectedAccountVersion: z.string().regex(/^[0-9]+$/),
    displayName: accountDisplayNameSchema.optional(),
    uiLocale: uiLocaleSchema.optional(),
    roles: z
      .array(roleSchema.exclude(['super_administrator']))
      .min(1)
      .max(4)
      .optional(),
    isEnabled: z.boolean().optional(),
    unlock: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some((key) => key !== 'expectedAccountVersion'),
    'At least one account change is required.',
  )

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1024),
  captchaId: uuidSchema,
  captchaAnswer: z.string().regex(/^\d{1,4}$/),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
})

export const loginResponseSchema = z.object({
  accessToken: z.string().min(32),
  expiresAt: z.string().datetime(),
  user: z.object({
    id: uuidSchema,
    username: z.string(),
    displayName: z.string().nullable().optional(),
    roles: z.array(roleSchema),
    locale: uiLocaleSchema,
    requiresPasswordChange: z.boolean(),
    passwordChangeRecommended: z.boolean().optional(),
  }),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
