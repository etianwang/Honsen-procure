import argon2 from 'argon2'
import { createApp } from './app.js'
import { AuthService } from './auth/service.js'
import { createPostgresPool, waitForDatabase } from './db/pool.js'
import { PostgresAuthStore } from './db/postgres-auth-store.js'
import { PostgresMasterDataStore } from './master-data/postgres-store.js'
import { MasterDataService } from './master-data/service.js'
import { PostgresSyncStore } from './sync/postgres-store.js'
import { SyncService } from './sync/service.js'
import { PostgresAuthorizationStore } from './authorization/postgres-store.js'
import { AuthorizationService } from './authorization/service.js'
import { AttachmentService } from './attachments/service.js'
import { S3AttachmentStore } from './attachments/s3-store.js'

const databaseUrl = process.env.POSTGRES_URL
if (!databaseUrl)
  throw new Error('POSTGRES_URL is required to start the server.')

const pool = createPostgresPool(databaseUrl)
await waitForDatabase(pool)
const attachmentConfig = [
  process.env.HONSEN_ATTACHMENT_BUCKET,
  process.env.HONSEN_ATTACHMENT_REGION,
  process.env.HONSEN_ATTACHMENT_ENDPOINT,
  process.env.HONSEN_ATTACHMENT_ACCESS_KEY_ID,
  process.env.HONSEN_ATTACHMENT_SECRET_ACCESS_KEY,
]
if (attachmentConfig.some((value) => !value))
  throw new Error('attachment object storage configuration is required')
const app = createApp(
  new AuthService(new PostgresAuthStore(pool), {
    verify: argon2.verify,
  }),
  new MasterDataService(new PostgresMasterDataStore(pool)),
  new SyncService(new PostgresSyncStore(pool)),
  new AuthorizationService(new PostgresAuthorizationStore(pool)),
  new AttachmentService(
    pool,
    new S3AttachmentStore(
      attachmentConfig[0]!,
      attachmentConfig[1]!,
      attachmentConfig[2]!,
      attachmentConfig[3]!,
      attachmentConfig[4]!,
    ),
  ),
)

app.addHook('onClose', async () => pool.end())
await app.listen({ host: '127.0.0.1', port: 3000 })
