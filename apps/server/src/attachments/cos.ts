import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'

const configSchema = z.object({
  region: z.string().regex(/^[a-z]{2}-[a-z]+(?:-\d+)?$/),
  bucket: z.string().regex(/^[a-z0-9-]+-\d+$/),
  secretId: z.string().min(1),
  secretKey: z.string().min(1),
  ttl: z.number().int().min(60).max(900).default(900),
})
type Credentials = { id: string; key: string; token?: string }
export class CosError extends Error {
  constructor(
    readonly code: string,
    readonly status: number = 502,
  ) {
    super(code)
  }
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const hmac = (key: string | Buffer, s: string) =>
  createHmac('sha256', key).update(s).digest()
const encode = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )

export class CosStorage {
  private readonly config: z.infer<typeof configSchema>
  constructor(config: unknown) {
    this.config = configSchema.parse(config)
  }
  static fromEnvironment(env: NodeJS.ProcessEnv): CosStorage | undefined {
    if (
      !env.COS_REGION &&
      !env.COS_BUCKET &&
      !env.COS_SECRET_ID &&
      !env.COS_SECRET_KEY
    )
      return undefined
    return new CosStorage({
      region: env.COS_REGION,
      bucket: env.COS_BUCKET,
      secretId: env.COS_SECRET_ID,
      secretKey: env.COS_SECRET_KEY,
      ttl: env.COS_SIGNED_URL_TTL_SECONDS
        ? Number(env.COS_SIGNED_URL_TTL_SECONDS)
        : 900,
    })
  }
  private sign(
    method: string,
    key: string,
    headers: Record<string, string> = {},
    credentials: Credentials = {
      id: this.config.secretId,
      key: this.config.secretKey,
    },
    params: Record<string, string> = {},
    timestamp = Math.floor(Date.now() / 1000),
  ) {
    if (!/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes('..'))
      throw new CosError('INVALID_OBJECT_KEY', 400)
    const host = `${this.config.bucket}.cos.${this.config.region}.myqcloud.com`
    const path = '/' + key.split('/').map(encode).join('/')
    const time = `${timestamp - 5};${timestamp + this.config.ttl}`
    const query = {
      ...params,
      ...(credentials.token
        ? { 'x-cos-security-token': credentials.token }
        : {}),
    }
    const allHeaders = { host, ...headers }
    const canonical = (values: Record<string, string>) =>
      Object.keys(values)
        .map((k) => k.toLowerCase())
        .sort()
        .map((k) => `${encode(k)}=${encode(values[k])}`)
        .join('&')
    const headerList = Object.keys(allHeaders).sort().join(';'),
      paramList = Object.keys(query).sort().join(';')
    const httpString = `${method.toLowerCase()}\n${path}\n${canonical(query)}\n${canonical(allHeaders)}\n`
    const signKey = createHmac('sha1', credentials.key)
      .update(time)
      .digest('hex')
    const signature = createHmac('sha1', signKey)
      .update(
        `sha1\n${time}\n${createHash('sha1').update(httpString).digest('hex')}\n`,
      )
      .digest('hex')
    const auth = {
      'q-sign-algorithm': 'sha1',
      'q-ak': credentials.id,
      'q-sign-time': time,
      'q-key-time': time,
      'q-header-list': headerList,
      'q-url-param-list': paramList,
      'q-signature': signature,
    }
    return `https://${host}${path}?${new URLSearchParams({ ...query, ...auth })}`
  }
  // Only temporary identity appears in URLs sent to clients; long-term credentials stay here.
  private async temporary(
    key: string,
    action: 'PutObject' | 'GetObject',
  ): Promise<Credentials> {
    const timestamp = Math.floor(Date.now() / 1000),
      date = new Date(timestamp * 1000).toISOString().slice(0, 10)
    const appId = this.config.bucket.split('-').at(-1)
    const policy = {
      version: '2.0',
      statement: [
        {
          effect: 'allow',
          action: [`name/cos:${action}`],
          resource: [
            `qcs::cos:${this.config.region}:uid/${appId}:${this.config.bucket}/${key}`,
          ],
        },
      ],
    }
    const body = JSON.stringify({
      Name: 'honsen-attachment',
      Policy: JSON.stringify(policy),
      DurationSeconds: 1800,
    })
    const canonical = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:sts.tencentcloudapi.com\n\ncontent-type;host\n${hash(body)}`
    const scope = `${date}/sts/tc3_request`
    const signature = createHmac(
      'sha256',
      hmac(
        hmac(hmac(`TC3${this.config.secretKey}`, date), 'sts'),
        'tc3_request',
      ),
    )
      .update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`)
      .digest('hex')
    const response = await fetch('https://sts.tencentcloudapi.com/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-tc-action': 'GetFederationToken',
        'x-tc-version': '2018-08-13',
        'x-tc-timestamp': String(timestamp),
        'x-tc-region': this.config.region,
        authorization: `TC3-HMAC-SHA256 Credential=${this.config.secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(20000),
    })
    const parsed = z
      .object({
        Response: z.object({
          Credentials: z
            .object({
              TmpSecretId: z.string(),
              TmpSecretKey: z.string(),
              Token: z.string(),
            })
            .optional(),
          Error: z.object({ Code: z.string() }).optional(),
        }),
      })
      .safeParse(await response.json())
    if (!parsed.success) throw new CosError('COS_STS_INVALID_RESPONSE')
    const result = parsed.data.Response
    if (result.Error)
      throw new CosError(
        `COS_STS_${result.Error.Code.replace(/[^A-Za-z0-9.]/g, '')}`,
      )
    if (!result.Credentials) throw new CosError('COS_STS_UNAVAILABLE')
    return {
      id: result.Credentials.TmpSecretId,
      key: result.Credentials.TmpSecretKey,
      token: result.Credentials.Token,
    }
  }
  async upload(
    key: string,
    contentType: string,
    checksum: string,
    byteLength: number,
  ) {
    const headers: Record<string, string> = {
      'content-type': contentType,
      'content-length': String(byteLength),
      'x-cos-meta-sha256': checksum,
      'x-cos-forbid-overwrite': 'true',
    }
    return {
      url: this.sign(
        'PUT',
        key,
        headers,
        await this.temporary(key, 'PutObject'),
      ),
      headers,
      expiresAt: Math.floor(Date.now() / 1000) + this.config.ttl,
    }
  }
  async download(key: string, versionId: string | null) {
    return {
      url: this.sign(
        'GET',
        key,
        {},
        await this.temporary(key, 'GetObject'),
        versionId ? { versionId } : {},
      ),
      headers: {},
      expiresAt: Math.floor(Date.now() / 1000) + this.config.ttl,
    }
  }
  async inspect(
    key: string,
    expectedSize: number,
    expectedHash: string,
    expectedType: string,
  ) {
    const head = await fetch(this.sign('HEAD', key), {
      method: 'HEAD',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    })
    if (!head.ok) throw await cosFailure(head, 'HEAD')
    if (Number(head.headers.get('content-length')) !== expectedSize)
      throw new CosError('ATTACHMENT_SIZE_MISMATCH', 400)
    const versionId = head.headers.get('x-cos-version-id')
    const response = await fetch(
      this.sign('GET', key, {}, undefined, versionId ? { versionId } : {}),
      { redirect: 'error', signal: AbortSignal.timeout(60000) },
    )
    if (!response.ok || !response.body)
      throw new CosError(`COS_GET_${response.status}`)
    const digest = createHash('sha256')
    let length = 0
    let prefix = Buffer.alloc(0)
    for await (const chunk of response.body) {
      length += chunk.length
      if (length > expectedSize)
        throw new CosError('ATTACHMENT_SIZE_MISMATCH', 400)
      digest.update(chunk)
      if (prefix.length < 32)
        prefix = Buffer.concat([
          prefix,
          Buffer.from(chunk).subarray(0, 32 - prefix.length),
        ])
    }
    if (length !== expectedSize || digest.digest('hex') !== expectedHash)
      throw new CosError('ATTACHMENT_HASH_MISMATCH', 400)
    if (!validFileSignature(prefix, expectedType))
      throw new CosError('ATTACHMENT_TYPE_MISMATCH', 400)
    return { versionId, byteLength: length }
  }
  // Maintenance/test callers must establish ownership; no client-facing delete API exists.
  async removeOwnedTestObject(key: string, versionId: string | null = null) {
    if (
      !/^honsen-procure-tests\/[0-9a-f-]{36}\/(?:[0-9a-f-]{36}\/){0,3}[0-9a-f-]{36}(?:\.pdf)?$/.test(
        key,
      )
    )
      throw new CosError('TEST_PREFIX_REQUIRED', 400)
    const response = await fetch(
      this.sign('DELETE', key, {}, undefined, versionId ? { versionId } : {}),
      {
        method: 'DELETE',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      },
    )
    if (!response.ok) throw await cosFailure(response, 'DELETE')
    return response.status
  }
}

export function validFileSignature(
  bytes: Uint8Array,
  contentType: string,
): boolean {
  const b = Buffer.from(bytes),
    ascii = b.toString('ascii')
  if (contentType === 'application/pdf') return ascii.startsWith('%PDF-')
  if (contentType === 'image/jpeg')
    return b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  if (contentType === 'image/png')
    return b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (['image/heic', 'image/heif'].includes(contentType))
    return (
      ascii.slice(4, 8) === 'ftyp' &&
      /heic|heix|hevc|hevx|mif1/.test(ascii.slice(8, 32))
    )
  if (
    ['image/vnd.dwg', 'application/acad', 'application/octet-stream'].includes(
      contentType,
    )
  )
    return /^AC10\d\d/.test(ascii)
  const zip = b.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
  if (
    contentType.includes('openxmlformats') ||
    ['application/zip', 'application/x-zip-compressed'].includes(contentType)
  )
    return zip
  if (['application/msword', 'application/vnd.ms-excel'].includes(contentType))
    return b
      .subarray(0, 8)
      .equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]))
  return false
}

async function cosFailure(response: Response, operation: string) {
  const body = await response.text()
  const code = body.match(/<Code>([A-Za-z0-9.]+)<\/Code>/)?.[1] ?? 'UNKNOWN'
  return new CosError(`COS_${operation}_${response.status}_${code}`)
}
