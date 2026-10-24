import { z } from 'zod'
import { attachmentTypes } from '@honsen/shared'
import { procurementMutation } from './procurement-sync'

const ownerType = z.enum([
  'purchase_order',
  'receipt',
  'procurement_expenditure',
])
const viewSchema = z.object({
  id: z.uuid(),
  ownerType,
  ownerId: z.uuid(),
  originalName: z.string(),
  contentType: z.string(),
  byteLength: z.number().int(),
  uploadState: z.enum(['pending_upload', 'uploaded']),
  availableLocally: z.boolean(),
  retryCount: z.number().int(),
  lastError: z.string().nullable(),
})
const targetSchema = z.object({
  ownerType,
  ownerId: z.uuid(),
  description: z.string(),
})
export type AttachmentView = z.infer<typeof viewSchema>
export type AttachmentTarget = z.infer<typeof targetSchema>
function invoke<T>(command: string, args?: object): Promise<T> {
  const call = (
    window as Window & {
      __TAURI__?: {
        core?: { invoke?: <U>(command: string, args?: object) => Promise<U> }
      }
    }
  ).__TAURI__?.core?.invoke
  return call
    ? call<T>(command, args)
    : Promise.reject(new Error('DESKTOP_HOST_UNAVAILABLE'))
}
export const attachmentApi = {
  async list(orderId: string) {
    return z
      .array(viewSchema)
      .parse(await invoke('list_attachments', { orderId }))
  },
  async targets(orderId: string) {
    return z
      .array(targetSchema)
      .parse(await invoke('list_attachment_targets', { orderId }))
  },
  async import(orderId: string, target: AttachmentTarget, file: File) {
    if (file.size === 0 || file.size > 104857600)
      throw new Error('FILE_SIZE_LIMIT')
    const ext = file.name.split('.').at(-1)?.toLowerCase()
    const types = Object.entries(attachmentTypes).find(
      ([name]) => name === ext,
    )?.[1]
    if (!types) throw new Error('UNSUPPORTED_FILE')
    const contentType = types.find((t) => t === file.type) ?? types[0]
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('FILE_READ_FAILED'))
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result.slice(reader.result.indexOf(',') + 1))
          : reject(new Error('FILE_READ_FAILED'))
      reader.readAsDataURL(file)
    })
    const id = z.uuid().parse(
      await invoke('import_attachment', {
        input: {
          id: crypto.randomUUID(),
          orderId,
          ownerType: target.ownerType,
          ownerId: target.ownerId,
          originalName: file.name,
          contentType,
          dataBase64,
        },
      }),
    )
    procurementMutation()
    return id
  },
  async read(id: string) {
    return z
      .string()
      .regex(/^data:[a-zA-Z0-9.+/-]+;base64,[A-Za-z0-9+/=]+$/)
      .parse(await invoke('read_attachment', { id }))
  },
}
