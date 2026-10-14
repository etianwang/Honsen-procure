import { expect, it } from 'vitest'
import { attachmentObjectStoreConfig } from './config.js'

it('uses complete explicit attachment configuration without exposing it', () => {
  expect(
    attachmentObjectStoreConfig({
      HONSEN_ATTACHMENT_BUCKET: 'bucket',
      HONSEN_ATTACHMENT_REGION: 'region',
      HONSEN_ATTACHMENT_ENDPOINT: 'https://objects.example.test',
      HONSEN_ATTACHMENT_ACCESS_KEY_ID: 'id',
      HONSEN_ATTACHMENT_SECRET_ACCESS_KEY: 'secret',
    }),
  ).toMatchObject({
    bucket: 'bucket',
    endpoint: 'https://objects.example.test',
  })
})

it('derives the COS endpoint only from a complete legacy COS environment', () => {
  expect(
    attachmentObjectStoreConfig({
      COS_BUCKET: 'bucket-123',
      COS_REGION: 'ap-test',
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'secret',
    }),
  ).toMatchObject({ endpoint: 'https://bucket-123.cos.ap-test.myqcloud.com' })
  expect(() =>
    attachmentObjectStoreConfig({ COS_BUCKET: 'bucket-123' }),
  ).toThrow('required')
  expect(() =>
    attachmentObjectStoreConfig({
      HONSEN_ATTACHMENT_BUCKET: 'bucket',
      COS_BUCKET: 'other',
      COS_REGION: 'region',
      COS_SECRET_ID: 'id',
      COS_SECRET_KEY: 'secret',
    }),
  ).toThrow('incomplete')
})
