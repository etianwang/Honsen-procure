import { describe, expect, it } from 'vitest'
import { attachmentSyncStatusMessage } from './receipt-api'

describe('attachmentSyncStatusMessage', () => {
  it('keeps a failed attachment visible for retry', () => {
    expect(
      attachmentSyncStatusMessage({
        pendingAttachmentCount: 2,
        attachmentSyncFailed: true,
      }),
    ).toBe('附件同步失败，仍有 2 个待同步文件；可在联网后重试。')
  })

  it('distinguishes queued and completed attachment synchronization', () => {
    expect(
      attachmentSyncStatusMessage({
        pendingAttachmentCount: 1,
        attachmentSyncFailed: false,
      }),
    ).toBe('仍有 1 个附件等待同步。')
    expect(
      attachmentSyncStatusMessage({
        pendingAttachmentCount: 0,
        attachmentSyncFailed: false,
      }),
    ).toBe('附件已同步到云端。')
  })
})
