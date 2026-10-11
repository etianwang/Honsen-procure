import { z } from 'zod'
import { roleSchema, uiLocaleSchema, uuidSchema } from './contracts.js'

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
    roles: z.array(roleSchema),
    locale: uiLocaleSchema,
    requiresPasswordChange: z.boolean(),
  }),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
