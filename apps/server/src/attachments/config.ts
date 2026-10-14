export type AttachmentObjectStoreConfig = {
  bucket: string
  region: string
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
}

function required(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function attachmentObjectStoreConfig(
  env: NodeJS.ProcessEnv,
): AttachmentObjectStoreConfig {
  const configured = [
    required(env.HONSEN_ATTACHMENT_BUCKET),
    required(env.HONSEN_ATTACHMENT_REGION),
    required(env.HONSEN_ATTACHMENT_ENDPOINT),
    required(env.HONSEN_ATTACHMENT_ACCESS_KEY_ID),
    required(env.HONSEN_ATTACHMENT_SECRET_ACCESS_KEY),
  ]
  if (configured.every(Boolean))
    return {
      bucket: configured[0]!,
      region: configured[1]!,
      endpoint: configured[2]!,
      accessKeyId: configured[3]!,
      secretAccessKey: configured[4]!,
    }
  if (configured.some(Boolean))
    throw new Error('attachment object storage configuration is incomplete')

  const bucket = required(env.COS_BUCKET)
  const region = required(env.COS_REGION)
  const accessKeyId = required(env.COS_SECRET_ID)
  const secretAccessKey = required(env.COS_SECRET_KEY)
  if (!bucket || !region || !accessKeyId || !secretAccessKey)
    throw new Error('attachment object storage configuration is required')
  return {
    bucket,
    region,
    endpoint: `https://${bucket}.cos.${region}.myqcloud.com`,
    accessKeyId,
    secretAccessKey,
  }
}
