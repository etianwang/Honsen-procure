import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { S3AttachmentStore } from './s3-store.js'

let bytes = Buffer.alloc(0)
const server = createServer(async (request, response) => {
  if (request.method === 'PUT') {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    bytes = Buffer.concat(chunks)
    response.writeHead(200).end()
  } else if (request.method === 'GET') {
    response
      .writeHead(200, {
        'content-length': bytes.length,
        'content-type': 'application/pdf',
      })
      .end(bytes)
  } else {
    response.writeHead(405).end()
  }
})

let store: S3AttachmentStore
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('missing test port')
  store = new S3AttachmentStore(
    'test-bucket',
    'us-east-1',
    `http://127.0.0.1:${address.port}`,
    'test-access',
    'test-secret',
  )
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

it('transfers bytes through S3 presigned URLs and rejects altered content', async () => {
  const content = Buffer.from('%PDF-1.4 fixture')
  const key = 'attachments/test/fixture'
  const upload = await store.signUpload(key, 'application/pdf')
  expect(new URL(upload).searchParams.has('X-Amz-Signature')).toBe(true)
  expect(
    (
      await fetch(upload, {
        method: 'PUT',
        headers: { 'content-type': 'application/pdf' },
        body: content,
      })
    ).ok,
  ).toBe(true)
  const checksum = createHash('sha256').update(content).digest('hex')
  expect(await store.verify(key, content.length, checksum)).toBe(true)
  const download = await store.signDownload(key)
  expect(Buffer.from(await (await fetch(download)).arrayBuffer())).toEqual(
    content,
  )
  bytes = Buffer.from('tampered')
  expect(await store.verify(key, content.length, checksum)).toBe(false)
})
