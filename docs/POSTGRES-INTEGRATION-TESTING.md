# PostgreSQL Integration Testing

The migration tests in `apps/server/src/db/migration-runner.test.ts` run only when `TEST_DATABASE_URL` is set. They target a disposable test database and must never use production, staging, or the root `.env` connection.

## GitHub Actions

The `quality` workflow starts an isolated PostgreSQL 16 service and supplies `TEST_DATABASE_URL` only to that job. This makes migration coverage a required CI gate without exposing a deployment secret.

## Local disposable database

Use the Docker context provided by WSL2 Docker Engine on Windows or Colima on macOS. Copy the example and choose a local-only test password; `.env.test` is ignored and must never be committed.

```powershell
Copy-Item .env.test.example .env.test
docker compose --env-file .env.test -f compose.test.yaml up -d --wait
$test = ConvertFrom-StringData (Get-Content -Raw .env.test)
$env:TEST_DATABASE_URL = "postgresql://$($test.POSTGRES_TEST_USER):$($test.POSTGRES_TEST_PASSWORD)@127.0.0.1:$($test.POSTGRES_TEST_PORT)/$($test.POSTGRES_TEST_DATABASE)"
npm run test:postgres
docker compose --env-file .env.test -f compose.test.yaml down --volumes
```

```sh
cp .env.test.example .env.test
docker compose --env-file .env.test -f compose.test.yaml up -d --wait
set -a && . ./.env.test && set +a
export TEST_DATABASE_URL="postgresql://${POSTGRES_TEST_USER}:${POSTGRES_TEST_PASSWORD}@127.0.0.1:${POSTGRES_TEST_PORT}/${POSTGRES_TEST_DATABASE}"
npm run test:postgres
docker compose --env-file .env.test -f compose.test.yaml down --volumes
```

The test service binds only to `127.0.0.1:54329` by default, has no volume, and is intentionally separate from deployment configuration. Do not copy its connection URL into `.env`, desktop code, screenshots, or production scripts. A skipped integration suite is not a passed acceptance result.
