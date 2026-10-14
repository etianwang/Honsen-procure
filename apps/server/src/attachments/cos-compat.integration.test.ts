import { createHash, randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterAll, expect, it } from 'vitest'

const enabled = process.env.RUN_COS_COMPAT_TEST === '1'
const bucket = process.env.HONSEN_ATTACHMENT_BUCKET
const region = process.env.HONSEN_ATTACHMENT_REGION
const endpoint = process.env.HONSEN_ATTACHMENT_ENDPOINT
const accessKeyId = process.env.HONSEN_ATTACHMENT_ACCESS_KEY_ID
const secretAccessKey = process.env.HONSEN_ATTACHMENT_SECRET_ACCESS_KEY
const key = `honsen-procure/integration/stage5/${randomUUID()}.txt`
const client =
  enabled && bucket && region && endpoint && accessKeyId && secretAccessKey
    ? new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      })
    : null

afterAll(async () => {
  if (client && bucket)
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
})

it.skipIf(!enabled)(
  'uploads, downloads, verifies and deletes an isolated COS object',
  async () => {
    if (!client || !bucket)
      throw new Error('COS compatibility configuration is incomplete')
    const payload = Buffer.from(`honsen-stage5-${key}`)
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: payload,
        ContentType: 'text/plain',
      }),
    )
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    const downloaded = Buffer.from(await object.Body!.transformToByteArray())
    expect(downloaded).toEqual(payload)
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
      createHash('sha256').update(payload).digest('hex'),
    )
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    await expect(
      client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
    ).rejects.toMatchObject({
      name: expect.stringMatching(/NoSuchKey|NotFound/),
    })
  },
)
