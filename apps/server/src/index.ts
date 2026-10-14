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
import { attachmentObjectStoreConfig } from './attachments/config.js'

const databaseUrl = process.env.POSTGRES_URL
if (!databaseUrl)
  throw new Error('POSTGRES_URL is required to start the server.')

const pool = createPostgresPool(databaseUrl)
await waitForDatabase(pool)
const attachmentConfig = attachmentObjectStoreConfig(process.env)
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
      attachmentConfig.bucket,
      attachmentConfig.region,
      attachmentConfig.endpoint,
      attachmentConfig.accessKeyId,
      attachmentConfig.secretAccessKey,
    ),
  ),
)

app.addHook('onClose', async () => pool.end())
await app.listen({ host: '127.0.0.1', port: 3000 })
