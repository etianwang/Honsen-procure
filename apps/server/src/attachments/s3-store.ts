import { createHash } from 'node:crypto'
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { AttachmentObjectStore } from './service.js'

export class S3AttachmentStore implements AttachmentObjectStore {
  private readonly client: S3Client

  constructor(
    private readonly bucket: string,
    region: string,
    endpoint: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    const url = new URL(endpoint)
    if (
      url.protocol !== 'https:' &&
      !(process.env.NODE_ENV === 'test' && url.hostname === '127.0.0.1')
    )
      throw new Error('attachment object store requires HTTPS')
    this.client = new S3Client({
      region,
      endpoint: url.toString(),
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  signUpload(key: string, contentType: string) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 300 },
    )
  }

  signDownload(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 300 },
    )
  }

  async verify(key: string, byteLength: number, checksum: string) {
    const object = await this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          ['NoSuchKey', 'NotFound'].includes(error.name)
        )
          return null
        throw error
      })
    if (!object) return false
    if (!object.Body || object.ContentLength !== byteLength) return false
    const digest = createHash('sha256')
    let received = 0
    const reader = object.Body.transformToWebStream().getReader()
    for (;;) {
      const { done, value: bytes } = await reader.read()
      if (done) break
      received += bytes.length
      if (received > byteLength) return false
      digest.update(bytes)
    }
    return received === byteLength && digest.digest('hex') === checksum
  }
}
