import { z } from 'zod'
import { uuidSchema } from './contracts.js'

export const attachmentTypes = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  heic: ['image/heic', 'image/heif'],
  dwg: ['image/vnd.dwg', 'application/acad', 'application/octet-stream'],
  zip: ['application/zip', 'application/x-zip-compressed'],
} as const
export const attachmentImportSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    ownerType: z.enum(['purchase_order', 'receipt', 'procurement_expenditure']),
    ownerId: uuidSchema,
    originalName: z
      .string()
      .min(1)
      .max(255)
      .refine(
        (v) =>
          !/[\\/]/.test(v) &&
          Array.from(v).every((c) => c.charCodeAt(0) >= 32) &&
          v !== '.' &&
          v !== '..',
      ),
    contentType: z.string().min(1).max(128),
    byteLength: z.number().int().min(1).max(104857600),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ext = v.originalName.split('.').at(-1)?.toLowerCase()
    const types = Object.entries(attachmentTypes).find(
      ([key]) => key === ext,
    )?.[1] as readonly string[] | undefined
    if (
      !types?.includes(v.contentType) ||
      (v.ownerType === 'receipt' && !v.contentType.startsWith('image/')) ||
      (v.ownerType === 'purchase_order' && v.ownerId !== v.orderId)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Unsupported attachment type or owner',
      })
  })
export type AttachmentImport = z.infer<typeof attachmentImportSchema>
export const attachmentUploadSchema = z.object({
  id: uuidSchema,
  url: z.url().startsWith('https://'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.number().int(),
})
export const attachmentMetadataSchema = attachmentImportSchema.safeExtend({
  projectId: uuidSchema,
  countryId: uuidSchema,
  objectKey: z.string().min(1).max(1024),
  versionId: z.string().max(1024).nullable(),
  status: z.literal('uploaded'),
  uploadedBy: uuidSchema,
  createdAt: z.number().int().nonnegative(),
})
export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>
