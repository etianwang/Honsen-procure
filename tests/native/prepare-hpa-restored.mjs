import fs from 'node:fs'
import path from 'node:path'
const repo = process.cwd(),
  root = path.join(repo, '.cache/host-native-qa/recovery')
fs.mkdirSync(root, { recursive: true })
let driver = fs.readFileSync('tests/native/hpa-formal-pull.mjs', 'utf8')
driver = driver.replace(
  "const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')",
  'const repo = resolve(process.env.HONSEN_QA_REPO_ROOT)',
)
driver = driver.replace(
  "const root = join(repo, '.honsen-native-qa')",
  "const root = join(repo, '.cache/host-native-qa/recovery')",
)
driver = driver
  .replace('const pool = new Pool', 'let pool = new Pool')
  .replace(
    '  const issuer = await launch(1, 9242)',
    '  let issuer = await launch(1, 9242)',
  )
const anchor = "  report.pushReplayPreserved = true\n  phase = 'formal-pull'"
if (!driver.includes(anchor)) throw Error('HPA driver checkpoint changed')
const restore =
  String.raw`
  phase = 'archive-restore'
  await stop(receiver)
  await stop(issuer)
  const targetName = 'honsen-final-recovery-' + runId
  report.restoreTarget = targetName
  const shell = ` +
  '`' +
  String.raw`set -euo pipefail
cd /mnt/h/Honsen/Honsen-Procure
set -a; source .env.test; set +a
source_name="honsen-__RUNID__-postgres-test-1"
target_name="__TARGETNAME__"
archive="/tmp/__TARGETNAME__.dump"
docker run -d --name "$target_name" -e POSTGRES_USER="$POSTGRES_TEST_USER" -e POSTGRES_DB="$POSTGRES_TEST_DATABASE" -e POSTGRES_PASSWORD="$POSTGRES_TEST_PASSWORD" -p 127.0.0.1:54330:5432 postgres:16-alpine >/dev/null
for i in {1..40}; do docker exec "$target_name" pg_isready -U "$POSTGRES_TEST_USER" >/dev/null 2>&1 && break; sleep 1; done
trap 'rm -f "$archive"' EXIT
docker exec "$source_name" pg_dump -U "$POSTGRES_TEST_USER" -d "$POSTGRES_TEST_DATABASE" -Fc > "$archive"
docker exec -i "$target_name" pg_restore -U "$POSTGRES_TEST_USER" -d "$POSTGRES_TEST_DATABASE" --exit-on-error --no-owner --no-privileges < "$archive"
source_id=$(docker exec "$source_name" psql -U "$POSTGRES_TEST_USER" -d "$POSTGRES_TEST_DATABASE" -Atqc 'SELECT system_identifier FROM pg_control_system()')
target_id=$(docker exec "$target_name" psql -U "$POSTGRES_TEST_USER" -d "$POSTGRES_TEST_DATABASE" -Atqc 'SELECT system_identifier FROM pg_control_system()')
[[ "$source_id" != "$target_id" ]]
printf '%s %s ' "$source_id" "$target_id"
sha256sum "$archive" | cut -d ' ' -f 1
` +
  '`' +
  String.raw`
  const resolvedShell=shell.replaceAll('__RUNID__',runId).replaceAll('__TARGETNAME__',targetName)
  const restoreFacts=execFileSync('wsl.exe',['-d','Ubuntu-24.04','-u','honsen-dev','--','bash','-s'],{input:resolvedShell,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim().split(/\s+/)
  assert.equal(restoreFacts.length,3)
  report.archiveRestore={sourceClusterId:restoreFacts[0],targetClusterId:restoreFacts[1],archiveSha256:restoreFacts[2]}
  const restoredUrl=new URL(databaseUrl)
  restoredUrl.port='54330'
  await pool.end()
  pool=new Pool({connectionString:restoredUrl.toString()})
  const restoredOrder=(await pool.query('SELECT payload_json FROM sync_entities WHERE entity_id=$1',[orderId])).rows[0].payload_json
  report.archiveRestoredOrder=restoredOrder
  assert.equal(restoredOrder.formalDocumentNo,issue.formalDocumentNo)
  const restoredServer=spawn(process.execPath,[join(repo,'node_modules/tsx/dist/cli.mjs'),'src/scripts/native-test-server.ts'],{cwd:join(repo,'apps/server'),windowsHide:true,env:{...process.env,HONSEN_PROCURE_TEST_DATABASE_URL:restoredUrl.toString(),HONSEN_PROCURE_TEST_TLS_PORT:'3446'},stdio:'ignore'})
  children.push(restoredServer)
  process.env.HONSEN_SYNC_API_BASE_URL='https://localhost:3446'
  await delay(2500)
  receiver=await launch(0,9241)
  issuer=await launch(1,9242)
  await login(receiver,'engineer-a',process.env.HONSEN_TEST_ENGINEER_A_PASSWORD)
  await login(issuer,'purchaser',process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  report.restoredRealNativeLogin=true
  const restoredReplay=await call(issuer,'push_pending_sync')
  assert.equal(restoredReplay.acceptedCount,0)
  assert.equal(restoredReplay.pendingCount,0)
  report.restoredNativePushReplay=true
`
driver = driver.replace(
  anchor,
  '  report.pushReplayPreserved = true\n' +
    restore +
    "\n  phase = 'formal-pull'",
)
driver = driver.replace(
  '  await pool.end()\n  writeFileSync(resultPath',
  `  await pool.end()\n  if(report.restoreTarget)execFileSync('wsl.exe',['-d','Ubuntu-24.04','-u','honsen-dev','--','docker','rm','-f',report.restoreTarget],{stdio:'ignore'})\n  writeFileSync(resultPath`,
)
fs.writeFileSync(path.join(root, 'hpa-restored-driver.mjs'), driver)
let runner = fs.readFileSync('tests/native/run-native-https-smoke.ps1', 'utf8')
runner = runner.replace(
  "$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path",
  '$repo = $env:HONSEN_QA_REPO_ROOT',
)
runner = runner.replace(
  "$qaRoot = Join-Path $repo '.honsen-native-qa'",
  "$qaRoot = Join-Path $repo '.cache/host-native-qa/recovery'",
)
runner = runner.replace(
  'tests/native/$Mode.mjs',
  '.cache/host-native-qa/recovery/hpa-restored-driver.mjs',
)
runner = runner.replace(
  '@($smoke.exePids).Count -ne 3',
  '@($smoke.exePids).Count -ne 5 -or !$smoke.restoredRealNativeLogin -or !$smoke.restoredNativePushReplay -or $smoke.archiveRestore.sourceClusterId -eq $smoke.archiveRestore.targetClusterId -or $smoke.archiveRestore.archiveSha256 -notmatch "^[a-f0-9]{64}$"',
)
fs.writeFileSync(path.join(root, 'run-hpa-restored.ps1'), runner)
console.log(
  'Generated recovery wrapper reusing existing native HPA trusted-IPC workflow',
)
