import { z } from 'zod'
import { uuidSchema } from './contracts.js'

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
  'procurement_expenditure',
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
})

export const syncPushResponseSchema = z.object({
  results: z.array(syncEventResultSchema),
})

export const syncPullQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
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
})

export type SyncEvent = z.infer<typeof syncEventSchema>
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>
export type SyncEventResult = z.infer<typeof syncEventResultSchema>
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>
export type SyncChange = z.infer<typeof syncChangeSchema>
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>
