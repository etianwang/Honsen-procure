# PostgreSQL Integration Testing

The migration tests in `apps/server/src/db/migration-runner.test.ts` run only when `TEST_DATABASE_URL` is set. They target a disposable test database and must never use production, staging, or the root `.env` connection.

## GitHub Actions

The `quality` workflow starts an isolated PostgreSQL 16 service and supplies `TEST_DATABASE_URL` only to that job. This makes migration coverage a required CI gate without exposing a deployment secret.

## Local disposable database

With Docker Compose available, start the isolated database:

```powershell
docker compose -f compose.test.yml up -d --wait
$env:TEST_DATABASE_URL = 'postgresql://honsen_test:honsen_test@localhost:54329/honsen_test'
npm run test --workspace @honsen/server
docker compose -f compose.test.yml down --volumes
```

The test compose file has no volume, contains only test-only credentials, and is intentionally separate from deployment configuration. Do not copy its connection URL into `.env`, desktop code, screenshots, or production scripts.
