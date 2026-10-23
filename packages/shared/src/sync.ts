import { z } from 'zod'
import { uuidSchema } from './contracts.js'
import { materialCategorySchema } from './master-data.js'

export const categoryRepairRequestSchema = z.strictObject({
  requestId: uuidSchema,
  categoryId: uuidSchema,
  expectedVersion: z.number().int().min(1),
  newBusinessCode: materialCategorySchema.shape.businessCode,
  reason: z.string().trim().min(1).max(1000),
})
export type CategoryRepairRequest = z.infer<typeof categoryRepairRequestSchema>

export const syncEntityTypeSchema = z.enum([
  'country',
  'project',
  'site',
  'department',
  'team',
  'unit',
  'tax_template',
  'exchange_rate',
  'project_defaults',
  'material_category',
  'material',
  'supplier',
  'material_price',
  'purchase_order',
  'order_comment',
  'receipt',
  'rfq',
  'attachment',
])

export const syncOperationSchema = z.enum(['upsert', 'soft_delete'])

export const syncEventSchema = z.object({
  eventId: uuidSchema,
  entityType: syncEntityTypeSchema,
  entityId: uuidSchema,
  operation: syncOperationSchema,
  baseVersion: z.number().int().min(0),
  payload: z.record(z.string(), z.unknown()),
})

export const syncPushRequestSchema = z.object({
  deviceId: uuidSchema,
  events: z.array(syncEventSchema).min(1).max(100),
})

export const syncEventResultSchema = z.object({
  eventId: uuidSchema,
  status: z.enum(['accepted', 'conflict', 'validation_error']),
  serverVersion: z.number().int().min(0).nullable(),
  errorCode: z.string().min(1).max(80).optional(),
  serverPayload: z.record(z.string(), z.unknown()).optional(),
  serverOperation: syncOperationSchema.optional(),
})

export const syncPushResponseSchema = z.object({
  results: z.array(syncEventResultSchema),
})

export const syncPullQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  replayUntil: z
    .string()
    .regex(/^\d{1,19}$/)
    .optional(),
  authorizationVersion: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
})

export const syncChangeSchema = z.object({
  cursor: z.string().regex(/^\d+$/),
  entityType: syncEntityTypeSchema,
  entityId: uuidSchema,
  operation: syncOperationSchema,
  version: z.number().int().min(1),
  payload: z.record(z.string(), z.unknown()),
  changedAt: z.string().datetime(),
})

export const syncPullResponseSchema = z.object({
  changes: z.array(syncChangeSchema),
  nextCursor: z.string().regex(/^\d+$/),
  authorizationVersion: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  replayUntil: z.string().regex(/^\d+$/).optional(),
})

export type SyncEvent = z.infer<typeof syncEventSchema>
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>
export type SyncEventResult = z.infer<typeof syncEventResultSchema>
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>
export type SyncChange = z.infer<typeof syncChangeSchema>
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>
