import { describe, expect, it } from 'vitest'
import { attachmentImportSchema } from './attachments.js'

describe('HEIC attachment derivation contract', () => {
  const orderId = '00000000-0000-4000-8000-000000000001'
  const data = {
    id: '00000000-0000-4000-8000-000000000002',
    orderId,
    ownerType: 'purchase_order',
    ownerId: orderId,
    originalName: 'gradient.jpg',
    contentType: 'image/jpeg',
    byteLength: 100,
    checksum: 'a'.repeat(64),
    sourceAttachmentId: '00000000-0000-4000-8000-000000000003',
  }
  it('keeps a typed source reference on the JPEG derivative', () => {
    expect(attachmentImportSchema.parse(data)).toHaveProperty(
      'sourceAttachmentId',
      data.sourceAttachmentId,
    )
  })
  it('canonicalizes the source UUID before uniqueness checks', () => {
    const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
    expect(
      attachmentImportSchema.parse({ ...data, sourceAttachmentId: upper })
        .sourceAttachmentId,
    ).toBe(upper.toLowerCase())
  })
  it('rejects self-references and non-JPEG derivatives', () => {
    expect(
      attachmentImportSchema.safeParse({ ...data, sourceAttachmentId: data.id })
        .success,
    ).toBe(false)
    expect(
      attachmentImportSchema.safeParse({
        ...data,
        originalName: 'gradient.heic',
        contentType: 'image/heic',
      }).success,
    ).toBe(false)
  })
})
