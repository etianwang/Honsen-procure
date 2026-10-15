import { describe, expect, it } from 'vitest'
import {
  attachmentSyncStatusMessage,
  attachmentTransferProgressMessage,
} from './receipt-api'

describe('attachmentSyncStatusMessage', () => {
  it('keeps a failed attachment visible for retry', () => {
    expect(
      attachmentSyncStatusMessage({
        pendingAttachmentCount: 2,
        attachmentSyncFailed: true,
        attachmentTransferCount: 0,
        attachmentTransferBytes: 0,
      }),
    ).toBe('附件同步失败，仍有 2 个待同步文件；可在联网后重试。')
  })

  it('distinguishes queued and completed attachment synchronization', () => {
    expect(
      attachmentSyncStatusMessage({
        pendingAttachmentCount: 1,
        attachmentSyncFailed: false,
        attachmentTransferCount: 0,
        attachmentTransferBytes: 0,
      }),
    ).toBe('仍有 1 个附件等待同步。')
    expect(
      attachmentSyncStatusMessage({
        pendingAttachmentCount: 0,
        attachmentSyncFailed: false,
        attachmentTransferCount: 0,
        attachmentTransferBytes: 0,
      }),
    ).toBe('附件已同步到云端。')
  })

  it('reports the exact completed attachment transfer bytes', () => {
    expect(
      attachmentSyncStatusMessage({
        pendingAttachmentCount: 0,
        attachmentSyncFailed: false,
        attachmentTransferCount: 1,
        attachmentTransferBytes: 1536,
      }),
    ).toBe('已同步 1 个附件（1.5 KiB）。')
  })

  it('makes upload and download byte progress understandable', () => {
    expect(
      attachmentTransferProgressMessage({
        attachmentId: 'attachment-1',
        direction: 'upload',
        transferredBytes: 1024,
        totalBytes: 1536,
        state: 'transferring',
      }),
    ).toBe('附件上传中：1.0 KiB / 1.5 KiB。')
    expect(
      attachmentTransferProgressMessage({
        attachmentId: 'attachment-1',
        direction: 'download',
        transferredBytes: 1536,
        totalBytes: 1536,
        state: 'completed',
      }),
    ).toBe('附件下载完成：1.5 KiB。')
  })
})
