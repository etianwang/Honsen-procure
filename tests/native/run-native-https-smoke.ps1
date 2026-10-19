[CmdletBinding()]
param(
  [ValidateSet('g1-conflict-origin', 'ab-sync-security', 'pull-recovery', 'pull-page-recovery', 'cursor-write-recovery', 'push-termination-recovery', 'offline-push-recovery', 'push-partial-batch')]
  [string]$Mode = 'ab-sync-security',
  [ValidateSet('before-commit', 'after-commit')]
  [string]$TerminationBoundary = 'before-commit',
  [ValidatePattern('^native-smoke-[0-9]{14}$')]
  [string]$RunId
)

$ErrorActionPreference = 'Stop'
if (!(Test-Path 'Cert:\CurrentUser\My')) { throw 'CurrentUser certificate store is unavailable for native HTTPS test trust' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runId = if ($RunId) { $RunId } else { "native-smoke-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))" }
$qaRoot = Join-Path $repo '.honsen-native-qa'
$logRoot = Join-Path $repo 'test-results'
$profileA = Join-Path $qaRoot "$runId-account-a.test.sqlite"
$profileB = Join-Path $qaRoot "$runId-account-b.test.sqlite"
$result = Join-Path $qaRoot "$runId.test.json"
$interruptedResult = Join-Path $qaRoot "$runId-pull-interrupted.test.json"
$recoveredResult = Join-Path $qaRoot "$runId-pull-recovered.test.json"
$pageInterruptedResult = Join-Path $qaRoot "$runId-pull-page-interrupted.test.json"
$pageRecoveredResult = Join-Path $qaRoot "$runId-pull-page-recovered.test.json"
$pageProducerResult = Join-Path $qaRoot "$runId-pull-page-producer.test.json"
$cursorWriteProducerResult = Join-Path $qaRoot "$runId-cursor-write-producer.test.json"
$cursorWriteFaultResult = Join-Path $qaRoot "$runId-cursor-write-fault.test.json"
$cursorWriteRecoveredResult = Join-Path $qaRoot "$runId-cursor-write-recovered.test.json"
$offlineResult = Join-Path $qaRoot "$runId-offline-push.test.json"
$offlineRecoveredResult = Join-Path $qaRoot "$runId-offline-push-recovered.test.json"
$partialBatchResult = Join-Path $qaRoot "$runId-push-partial-batch.test.json"
$terminationInflightResult = Join-Path $qaRoot "$runId-push-termination-inflight.test.json"
$terminationRecoveredResult = Join-Path $qaRoot "$runId-push-termination-recovered.test.json"
$terminationReady = Join-Path $qaRoot "$runId-push-termination-ready.signal"
$terminationRelease = Join-Path $qaRoot "$runId-push-termination-release.signal"
$terminationPidPath = Join-Path $qaRoot "$runId-push-termination.pid"
$offlineReady = Join-Path $qaRoot "$runId-offline-ready.signal"
$offlineContinue = Join-Path $qaRoot "$runId-offline-continue.signal"
$diagnostics = Join-Path $qaRoot "$runId-server-sync.test.jsonl"
$pfx = Join-Path $qaRoot "$runId.pfx"
$cer = Join-Path $qaRoot "$runId.cer"
$pem = Join-Path $qaRoot "$runId.pem"
$serverLog = Join-Path $logRoot "$runId-server.log"
$serverErrorLog = Join-Path $logRoot "$runId-server-error.log"
$composeLog = Join-Path $logRoot "$runId-compose.log"
$composeErrorLog = Join-Path $logRoot "$runId-compose-error.log"
$nativeLog = Join-Path $logRoot "$runId-client.log"
$nativeErrorLog = Join-Path $logRoot "$runId-client-error.log"
$composeProject = "honsen-$runId"
$server = $null
$wslHolder = $null
$certificate = $null

New-Item -ItemType Directory -Force -Path $qaRoot, $logRoot | Out-Null
try {
  if (!(Test-Path (Join-Path $repo '.env.test'))) {
    throw '.env.test is required and must contain only disposable test PostgreSQL credentials'
  }
  Get-Content (Join-Path $repo '.env.test') | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2] }
  }
  foreach ($name in 'POSTGRES_TEST_DATABASE', 'POSTGRES_TEST_USER', 'POSTGRES_TEST_PASSWORD', 'POSTGRES_TEST_PORT') {
    if (!(Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue)) { throw "$name is required by .env.test" }
  }

  $wslRepo = (& wsl.exe -- wslpath -a $repo.Replace('\', '/')).Trim()
  if (!$wslRepo) { throw 'WSL is required for the disposable PostgreSQL test service' }
  $composeCommand = "cd '$wslRepo' && docker compose --project-name $composeProject --env-file .env.test -f compose.test.yaml up -d --wait && exec tail -f /dev/null"
  $wslHolder = Start-Process -FilePath wsl.exe -ArgumentList @('--', 'bash', '-lc', $composeCommand) -PassThru -RedirectStandardOutput $composeLog -RedirectStandardError $composeErrorLog -WindowStyle Hidden
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ((Test-NetConnection -ComputerName localhost -Port $env:POSTGRES_TEST_PORT -InformationLevel Quiet)) { break }
    if ($wslHolder.HasExited) { throw "WSL Compose holder exited; inspect $composeLog" }
    Start-Sleep -Milliseconds 500
  }
  if ($wslHolder.HasExited) { throw 'WSL Compose holder exited before the isolated PostgreSQL service became available' }
  if (!(Test-NetConnection -ComputerName localhost -Port $env:POSTGRES_TEST_PORT -InformationLevel Quiet)) { throw "isolated PostgreSQL service did not listen; inspect $composeLog" }

  $certificate = New-SelfSignedCertificate -DnsName 'localhost', '127.0.0.1' -CertStoreLocation 'Cert:\CurrentUser\My' -Type SSLServerAuthentication -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(1)
  $pfxPassword = [Guid]::NewGuid().ToString('N')
  $securePfxPassword = ConvertTo-SecureString -String $pfxPassword -AsPlainText -Force
  Export-PfxCertificate -Cert $certificate -FilePath $pfx -Password $securePfxPassword | Out-Null
  Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
  & certutil.exe -encode $cer $pem | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'cannot encode the native test certificate as PEM' }

  $escapedPassword = [Uri]::EscapeDataString($env:POSTGRES_TEST_PASSWORD)
  $env:HONSEN_PROCURE_TEST_DATABASE_URL = "postgresql://$($env:POSTGRES_TEST_USER):$escapedPassword@127.0.0.1:$($env:POSTGRES_TEST_PORT)/$($env:POSTGRES_TEST_DATABASE)"
  $env:HONSEN_PROCURE_TEST_TLS_PFX = $pfx
  $env:HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD = $pfxPassword
  $env:HONSEN_PROCURE_TEST_TLS_PORT = '3443'
  $env:HONSEN_TEST_ENGINEER_A_PASSWORD = "native-a-$([Guid]::NewGuid().ToString('N'))"
  $env:HONSEN_TEST_ENGINEER_B_PASSWORD = "native-b-$([Guid]::NewGuid().ToString('N'))"
  $env:HONSEN_TEST_PURCHASER_PASSWORD = "native-p-$([Guid]::NewGuid().ToString('N'))"
  $env:HONSEN_PROCURE_TEST_FAIL_FIRST_PUSH_RESPONSE = if ($Mode -eq 'ab-sync-security') { '1' } else { '0' }
  $env:HONSEN_PROCURE_TEST_FAIL_FIRST_PULL_RESPONSE = if ($Mode -eq 'pull-recovery') { '1' } else { '0' }
  $env:HONSEN_PROCURE_TEST_FAIL_PULL_AT_CURSOR = if ($Mode -eq 'pull-page-recovery') { '500' } else { '' }
  $env:HONSEN_PROCURE_TEST_PUSH_BARRIER = if ($Mode -eq 'push-termination-recovery') { $TerminationBoundary } else { '' }
  $env:HONSEN_PROCURE_TEST_PUSH_BARRIER_READY_PATH = if ($Mode -eq 'push-termination-recovery') { $terminationReady } else { '' }
  $env:HONSEN_PROCURE_TEST_PUSH_BARRIER_RELEASE_PATH = if ($Mode -eq 'push-termination-recovery') { $terminationRelease } else { '' }
  $env:HONSEN_PROCURE_TEST_PUSH_BARRIER_PID_PATH = if ($Mode -eq 'push-termination-recovery') { $terminationPidPath } else { '' }
  $env:HONSEN_PROCURE_TEST_RUN_ID = $runId
  $env:HONSEN_PROCURE_TEST_AUTH_BARRIER_PREFIX = if ($Mode -eq 'g1-conflict-origin') { Join-Path $qaRoot "$runId-auth.test" } else { '' }
  $env:HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH = $diagnostics

  $tsxCli = Join-Path $repo 'node_modules\tsx\dist\cli.mjs'
  for ($launch = 0; $launch -lt 3; $launch++) {
    $server = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"{0}" src/scripts/native-test-server.ts' -f $tsxCli) -WorkingDirectory (Join-Path $repo 'apps\server') -PassThru -RedirectStandardOutput $serverLog -RedirectStandardError $serverErrorLog -WindowStyle Hidden
    Start-Sleep -Seconds 2
    if (!$server.HasExited) { break }
    if ($launch -eq 2) { throw "native HTTPS server repeatedly exited; inspect $serverLog" }
  }
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ((Test-NetConnection -ComputerName localhost -Port 3443 -InformationLevel Quiet)) { break }
    if ($server.HasExited) { throw "native HTTPS server exited; inspect $serverLog" }
    Start-Sleep -Milliseconds 500
  }
  if (!(Test-NetConnection -ComputerName localhost -Port 3443 -InformationLevel Quiet)) { throw "native HTTPS server did not listen; inspect $serverLog" }

  $desktop = Join-Path $repo 'apps\desktop\src-tauri'
  Push-Location $desktop
  try {
    cargo build --bin honsen-procure-test-profile --bin HonsenProcure
    $env:HONSEN_PROCURE_TEST_DB_PATH = $profileA
    & (Join-Path $desktop 'target\debug\honsen-procure-test-profile.exe') seed
    $env:HONSEN_PROCURE_TEST_DB_PATH = $profileB
    & (Join-Path $desktop 'target\debug\honsen-procure-test-profile.exe') seed
    $env:HONSEN_PROCURE_TEST_DB_PATH = $profileA
    $env:HONSEN_PROCURE_PROFILE = 'test'
    $env:HONSEN_PROCURE_TEST_TLS_CA_PEM = $pem
    $env:HONSEN_SYNC_API_BASE_URL = 'https://localhost:3443'
    $env:HONSEN_PROCURE_NATIVE_SMOKE = $Mode
    $env:HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH = $profileB
    $env:HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD = $env:HONSEN_TEST_ENGINEER_A_PASSWORD
    $env:HONSEN_PROCURE_NATIVE_AB_ENGINEER_B_PASSWORD = $env:HONSEN_TEST_ENGINEER_B_PASSWORD
    $env:HONSEN_PROCURE_NATIVE_AB_PURCHASER_PASSWORD = $env:HONSEN_TEST_PURCHASER_PASSWORD
    $env:RUST_BACKTRACE = '1'
    if ($Mode -eq 'g1-conflict-origin') {
      Remove-Item Env:HONSEN_PROCURE_NATIVE_SMOKE
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $result
      node (Join-Path $repo 'tests/native/g1-conflict-origin.mjs') *> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native G1 command/UI driver failed; inspect $nativeLog" }
    } elseif ($Mode -eq 'ab-sync-security') {
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $result
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native HonsenProcure.exe smoke failed; inspect $nativeLog" }
    } elseif ($Mode -eq 'push-partial-batch') {
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $partialBatchResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native partial Push batch smoke failed; inspect $nativeLog" }
    } elseif ($Mode -eq 'pull-recovery') {
      $env:HONSEN_PROCURE_NATIVE_PULL_RECOVERY_PHASE = 'interrupted'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $interruptedResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native interrupted Pull smoke failed; inspect $nativeLog" }
      $interrupted = Get-Content -Raw $interruptedResult | ConvertFrom-Json
      $env:HONSEN_PROCURE_NATIVE_PULL_RECOVERY_PHASE = 'recovered'
      $env:HONSEN_PROCURE_NATIVE_PULL_RECOVERY_ENTITY_ID = $interrupted.entityId
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $recoveredResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *>> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native recovered Pull smoke failed; inspect $nativeLog" }
    } elseif ($Mode -eq 'pull-page-recovery') {
      $env:HONSEN_PROCURE_TEST_DB_PATH = $profileB
      $env:HONSEN_PROCURE_NATIVE_PULL_PAGE_RECOVERY_PHASE = 'producer'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $pageProducerResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native paged Pull producer smoke failed; inspect $nativeLog" }
      $env:HONSEN_PROCURE_TEST_DB_PATH = $profileA
      $env:HONSEN_PROCURE_NATIVE_PULL_PAGE_RECOVERY_PHASE = 'interrupted'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $pageInterruptedResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *>> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native interrupted paged Pull smoke failed; inspect $nativeLog" }
      $env:HONSEN_PROCURE_NATIVE_PULL_PAGE_RECOVERY_PHASE = 'recovered'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $pageRecoveredResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *>> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native recovered paged Pull smoke failed; inspect $nativeLog" }
    } elseif ($Mode -eq 'cursor-write-recovery') {
      $env:HONSEN_PROCURE_TEST_DB_PATH = $profileB
      $env:HONSEN_PROCURE_NATIVE_CURSOR_WRITE_RECOVERY_PHASE = 'producer'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $cursorWriteProducerResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native Cursor write producer smoke failed; inspect $nativeLog" }
      $env:HONSEN_PROCURE_TEST_DB_PATH = $profileA
      $env:HONSEN_PROCURE_NATIVE_CURSOR_WRITE_RECOVERY_PHASE = 'fault'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $cursorWriteFaultResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *>> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native Cursor write fault smoke failed; inspect $nativeLog" }
      $env:HONSEN_PROCURE_NATIVE_CURSOR_WRITE_RECOVERY_PHASE = 'recovered'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $cursorWriteRecoveredResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *>> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native Cursor write recovery smoke failed; inspect $nativeLog" }
    } elseif ($Mode -eq 'push-termination-recovery') {
      $env:HONSEN_PROCURE_NATIVE_PUSH_TERMINATION_PHASE = 'inflight'
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $terminationInflightResult
      $terminationProcess = Start-Process -FilePath (Join-Path $desktop 'target\debug\HonsenProcure.exe') -PassThru -RedirectStandardOutput $nativeLog -RedirectStandardError $nativeErrorLog -WindowStyle Hidden
      $terminationPid = $terminationProcess.Id
      Set-Content -LiteralPath $terminationPidPath -Value $terminationPid -NoNewline
      for ($attempt = 0; $attempt -lt 120; $attempt++) {
        if (Test-Path $terminationReady) { break }
        if ($terminationProcess.HasExited) { throw "native termination EXE exited before server barrier; inspect $nativeLog / $nativeErrorLog" }
        Start-Sleep -Milliseconds 100
      }
      if (!(Test-Path $terminationReady) -or !(Test-Path $terminationInflightResult)) { throw "native termination barrier was not reached" }
      Stop-Process -Id $terminationPid -Force
      if (!$terminationProcess.WaitForExit(10000)) { throw "could not force-terminate native EXE PID $terminationPid" }
      New-Item -ItemType File -Path $terminationRelease | Out-Null
      $inflight = Get-Content -Raw $terminationInflightResult | ConvertFrom-Json
      $env:HONSEN_PROCURE_NATIVE_PUSH_TERMINATION_PHASE = 'recovered'
      $env:HONSEN_PROCURE_NATIVE_PUSH_TERMINATION_EVENT_ID = $inflight.eventId
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $terminationRecoveredResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *>> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native termination recovery smoke failed; inspect $nativeLog / $nativeErrorLog" }
    } else {
      $env:HONSEN_PROCURE_NATIVE_OFFLINE_PUSH_PHASE = 'offline'
      $env:HONSEN_PROCURE_NATIVE_OFFLINE_READY_PATH = $offlineReady
      $env:HONSEN_PROCURE_NATIVE_OFFLINE_CONTINUE_PATH = $offlineContinue
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $offlineResult
      $offlineProcess = Start-Process -FilePath (Join-Path $desktop 'target\debug\HonsenProcure.exe') -PassThru -RedirectStandardOutput $nativeLog -RedirectStandardError $nativeErrorLog -WindowStyle Hidden
      for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-Path $offlineReady) { break }
        if ($offlineProcess.HasExited) { throw "native online-baseline EXE exited before offline handoff; inspect $nativeLog / $nativeErrorLog" }
        Start-Sleep -Milliseconds 500
      }
      if (!(Test-Path $offlineReady)) { throw "native offline harness did not reach the online baseline; inspect $nativeLog / $nativeErrorLog" }
      Stop-Process -Id $server.Id -Force
      $server.WaitForExit()
      if (Test-NetConnection -ComputerName localhost -Port 3443 -InformationLevel Quiet) { throw 'native offline harness could still reach the HTTPS endpoint after stop' }
      New-Item -ItemType File -Path $offlineContinue | Out-Null
      if (!$offlineProcess.WaitForExit(30000)) { throw "native offline EXE did not exit after the disconnected Push; inspect $nativeLog / $nativeErrorLog" }
      if ($offlineProcess.ExitCode -ne 0) { throw "native offline EXE failed; inspect $nativeLog / $nativeErrorLog" }
      for ($launch = 0; $launch -lt 3; $launch++) {
        $server = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"{0}" src/scripts/native-test-server.ts' -f $tsxCli) -WorkingDirectory (Join-Path $repo 'apps\server') -PassThru -RedirectStandardOutput $serverLog -RedirectStandardError $serverErrorLog -WindowStyle Hidden
        Start-Sleep -Seconds 2
        if (!$server.HasExited) { break }
        if ($launch -eq 2) { throw "native HTTPS server did not restart; inspect $serverLog / $serverErrorLog" }
      }
      for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ((Test-NetConnection -ComputerName localhost -Port 3443 -InformationLevel Quiet)) { break }
        if ($server.HasExited) { throw "native HTTPS server exited during restart; inspect $serverLog / $serverErrorLog" }
        Start-Sleep -Milliseconds 500
      }
      if (!(Test-NetConnection -ComputerName localhost -Port 3443 -InformationLevel Quiet)) { throw "native HTTPS server did not restart; inspect $serverLog / $serverErrorLog" }
      $offline = Get-Content -Raw $offlineResult | ConvertFrom-Json
      $env:HONSEN_PROCURE_NATIVE_OFFLINE_PUSH_PHASE = 'recovered'
      $env:HONSEN_PROCURE_NATIVE_OFFLINE_ENTITY_ID = $offline.entityId
      $env:HONSEN_PROCURE_NATIVE_OFFLINE_EVENT_ID = $offline.eventId
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $offlineRecoveredResult
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *>> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native recovered offline Push smoke failed; inspect $nativeLog / $nativeErrorLog" }
    }
  } finally {
    Pop-Location
  }
  if ($Mode -eq 'g1-conflict-origin') {
    $smoke = Get-Content -Raw $result | ConvertFrom-Json
    if ($smoke.mode -ne 'g1-conflict-origin' -or $smoke.coreResult -ne 'PASS' -or $smoke.sameProfileSwitch -ne 'PASS' -or $smoke.ownerRecoveryAndResolution -ne 'PASS' -or !$smoke.revokedSessionAccess.denied -or $smoke.revokedSessionAccess.sourceDisclosed -or $smoke.lateAccountPreserved -ne 'PASS' -or $smoke.lateSameAccountPreserved -ne 'PASS') {
      throw "native G1 command result is invalid: $result"
    }
    if (@($smoke.managementRevocations).Count -ne 4 -or @($smoke.managementRevocations | Where-Object { $_.serverStatus -ne 401 -or !$_.session.revoked_at -or !$_.contextDenied -or !$_.selectionDenied -or $_.sourceDisclosed }).Count -ne 0 -or $smoke.managementLateAccountPreserved -ne 'PASS' -or $smoke.managementLateSameAccountPreserved -ne 'PASS' -or @($smoke.exePids).Count -ne 2) {
      throw "native G1 management invalidation result is invalid: $result"
    }
    Write-Output "PASS native G1 command slice only (UI conflict residue remains BLOCKED): $result"
  } elseif ($Mode -eq 'ab-sync-security') {
    $smoke = Get-Content -Raw $result | ConvertFrom-Json
    if ($smoke.mode -ne 'ab-sync-security' -or $smoke.independentInstallations -ne 'PASS' -or $smoke.forgedDeviceIdTrustedOrigin -ne 'PASS' -or $smoke.accountIsolation -ne 'PASS' -or $smoke.conflictIsolation -ne 'PASS' -or $smoke.pushReplayIdempotency -ne 'PASS') {
      throw "native smoke result is invalid: $result"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS A/B sync security smoke: $result"
  } elseif ($Mode -eq 'push-partial-batch') {
    $partial = Get-Content -Raw $partialBatchResult | ConvertFrom-Json
    $partialRecord = @(Get-Content $diagnostics | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.route -eq 'POST /api/sync/push' -and $_.eventIds -contains $partial.acceptedEventId -and $_.eventIds -contains $partial.conflictEventId })
    $partialPayload = if ($partialRecord.Count -eq 1) { $partialRecord[0].servicePayload | ConvertFrom-Json } else { $null }
    $partialStatuses = @($partialPayload.results | ForEach-Object { "$( $_.eventId ):$( $_.status )" })
    if ($partial.mode -ne 'push-partial-batch' -or $partial.partialBatchAcceptedOnly -ne 'PASS' -or $partial.conflictEventRetained -ne 'PASS' -or $partial.conflictProjected -ne 'PASS' -or $partial.replayRetained -ne 'PASS' -or $partial.partialAcceptedCount -ne 1 -or $partial.partialPendingCount -ne 1 -or $partial.pendingAfterPartial -ne 1 -or $partial.pullAppliedCount -ne 2 -or $partial.conflictCount -ne 1 -or $partial.replayAcceptedCount -ne 0 -or $partial.replayPendingCount -ne 1 -or $partialRecord.Count -ne 1 -or $partialRecord[0].serverStatus -ne 200 -or $partialStatuses -notcontains "$($partial.acceptedEventId):accepted" -or $partialStatuses -notcontains "$($partial.conflictEventId):conflict") {
      throw "native partial Push batch result is invalid: $partialBatchResult / $diagnostics"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS partial Push batch smoke: $partialBatchResult"
  } elseif ($Mode -eq 'pull-recovery') {
    $interrupted = Get-Content -Raw $interruptedResult | ConvertFrom-Json
    $recovered = Get-Content -Raw $recoveredResult | ConvertFrom-Json
    if ($interrupted.mode -ne 'pull-recovery' -or $interrupted.pullFailure -ne 'PASS' -or $interrupted.cursorUnchanged -ne 'PASS' -or $recovered.mode -ne 'pull-recovery' -or $recovered.recovery -ne 'PASS' -or $recovered.replay -ne 'PASS' -or $recovered.cursorPersisted -ne 'PASS') {
      throw "native Pull recovery result is invalid: $interruptedResult / $recoveredResult"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS Pull recovery smoke: $interruptedResult / $recoveredResult"
  } elseif ($Mode -eq 'pull-page-recovery') {
    $producer = Get-Content -Raw $pageProducerResult | ConvertFrom-Json
    $interrupted = Get-Content -Raw $pageInterruptedResult | ConvertFrom-Json
    $recovered = Get-Content -Raw $pageRecoveredResult | ConvertFrom-Json
    $pullRecords = @(Get-Content $diagnostics | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.route -eq 'GET /api/sync/pull' })
    $firstPage = @($pullRecords | Where-Object { $_.requestedCursor -eq '0' -and $_.serverStatus -eq 200 -and $_.responseChangeCount -eq 500 -and $_.responseNextCursor -eq '500' })
    $fault = @($pullRecords | Where-Object { $_.requestedCursor -eq '500' -and $_.serverStatus -eq 503 -and $_.injectedTransportFault -eq $true })
    $recoveryPage = @($pullRecords | Where-Object { $_.requestedCursor -eq '500' -and $_.serverStatus -eq 200 -and $_.responseChangeCount -eq 1 -and $_.responseNextCursor -eq '501' })
    $replayPage = @($pullRecords | Where-Object { $_.requestedCursor -eq '501' -and $_.serverStatus -eq 200 -and $_.responseChangeCount -eq 0 -and $_.responseNextCursor -eq '501' })
    if ($producer.mode -ne 'pull-page-recovery' -or $producer.phase -ne 'producer' -or $producer.producerPush -ne 'PASS' -or $producer.eventCount -ne 501 -or $producer.acceptedCount -ne 501 -or $producer.outboxPendingAfterPush -ne 0 -or $interrupted.mode -ne 'pull-page-recovery' -or $interrupted.phase -ne 'interrupted' -or $interrupted.firstPageCommitted -ne 'PASS' -or $interrupted.secondPageTransportFailure -ne 'PASS' -or $interrupted.cursorAfterFailure -ne '500' -or $interrupted.projectedAfterFailure -ne 500 -or $interrupted.outboxPending -ne 0 -or $recovered.mode -ne 'pull-page-recovery' -or $recovered.phase -ne 'recovered' -or $recovered.restartRecovery -ne 'PASS' -or $recovered.allEventsProjectedOnce -ne 'PASS' -or $recovered.cursorAfterRecovery -ne '501' -or $recovered.cursorAfterReplay -ne '501' -or $recovered.projectedAfterRecovery -ne 501 -or $recovered.projectedAfterReplay -ne 501 -or $recovered.replayProjectedCount -ne 0 -or $recovered.outboxPending -ne 0 -or $firstPage.Count -ne 1 -or $fault.Count -ne 1 -or $recoveryPage.Count -ne 1 -or $replayPage.Count -ne 1) {
      throw "native paged Pull recovery result is invalid: $pageProducerResult / $pageInterruptedResult / $pageRecoveredResult / $diagnostics"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS paged Pull recovery smoke: $pageProducerResult / $pageInterruptedResult / $pageRecoveredResult"
  } elseif ($Mode -eq 'cursor-write-recovery') {
    $producer = Get-Content -Raw $cursorWriteProducerResult | ConvertFrom-Json
    $fault = Get-Content -Raw $cursorWriteFaultResult | ConvertFrom-Json
    $recovered = Get-Content -Raw $cursorWriteRecoveredResult | ConvertFrom-Json
    $pullRecords = @(Get-Content $diagnostics | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.route -eq 'GET /api/sync/pull' })
    $faultPage = @($pullRecords | Where-Object { $_.requestedCursor -eq '0' -and $_.serverStatus -eq 200 -and $_.responseChangeCount -eq 1 -and $_.responseNextCursor -eq '1' })
    $replayPage = @($pullRecords | Where-Object { $_.requestedCursor -eq '1' -and $_.serverStatus -eq 200 -and $_.responseChangeCount -eq 0 -and $_.responseNextCursor -eq '1' })
    if ($producer.mode -ne 'cursor-write-recovery' -or $producer.phase -ne 'producer' -or $producer.producerPush -ne 'PASS' -or $producer.acceptedCount -ne 1 -or $producer.outboxPending -ne 0 -or $fault.mode -ne 'cursor-write-recovery' -or $fault.phase -ne 'fault' -or $fault.cursorWriteFailure -ne 'PASS' -or $fault.transactionRollback -ne 'PASS' -or $fault.cursorNotAhead -ne 'PASS' -or !$fault.faultTriggered -or $fault.cursorBefore -ne '0' -or $fault.cursorAfter -ne '0' -or $fault.projectedBefore -ne 0 -or $fault.projectedAfter -ne 0 -or $fault.outboxPending -ne 0 -or $recovered.mode -ne 'cursor-write-recovery' -or $recovered.phase -ne 'recovered' -or $recovered.restartRecovery -ne 'PASS' -or $recovered.allEventsProjectedOnce -ne 'PASS' -or $recovered.cursorMonotonic -ne 'PASS' -or $recovered.replayEmpty -ne 'PASS' -or $recovered.cursorBefore -ne '0' -or $recovered.cursorAfterRecovery -ne '1' -or $recovered.cursorAfterReplay -ne '1' -or $recovered.recoveryProjectedCount -ne 1 -or $recovered.replayProjectedCount -ne 0 -or $recovered.projectedAfterRecovery -ne 1 -or $recovered.projectedAfterReplay -ne 1 -or $recovered.outboxPending -ne 0 -or $producer.accountId -eq $fault.accountId -or $producer.installationId -eq $fault.installationId -or $producer.profilePath -eq $fault.profilePath -or $faultPage.Count -ne 2 -or $replayPage.Count -ne 1) {
      throw "native Cursor write recovery result is invalid: $cursorWriteProducerResult / $cursorWriteFaultResult / $cursorWriteRecoveredResult / $diagnostics"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS Cursor write recovery smoke: $cursorWriteProducerResult / $cursorWriteFaultResult / $cursorWriteRecoveredResult"
  } elseif ($Mode -eq 'push-termination-recovery') {
    $inflight = Get-Content -Raw $terminationInflightResult | ConvertFrom-Json
    $recovered = Get-Content -Raw $terminationRecoveredResult | ConvertFrom-Json
    $records = @(Get-Content $diagnostics | ForEach-Object { $_ | ConvertFrom-Json })
    $barrier = @($records | Where-Object { $_.barrier -eq $TerminationBoundary -and $_.barrierReached -eq $true })
    $beforeRecovery = @($records | Where-Object { $_.terminationSnapshot -eq 'before-recovery' -and $_.eventId -eq $inflight.eventId })
    $afterRecovery = @($records | Where-Object { $_.terminationSnapshot -eq 'after-recovery' -and $_.eventId -eq $inflight.eventId })
    $cancellations = @($records | Where-Object { $_.cancellationObservation -eq $true -and $_.eventId -eq $inflight.eventId -and $_.accepted -eq $true })
    $pushes = @($records | Where-Object { $_.route -eq 'POST /api/sync/push' -and $_.eventId -eq $inflight.eventId })
    $beforeExpectedCount = if ($TerminationBoundary -eq 'before-commit') { '0' } else { '1' }
    if ($inflight.mode -ne 'push-termination-recovery' -or $inflight.outboxPending -ne 1 -or $recovered.recovery -ne 'PASS' -or $recovered.eventId -ne $inflight.eventId -or $recovered.acceptedCount -ne 1 -or $recovered.replayAcceptedCount -ne 0 -or $recovered.pullAppliedCount -ne 1 -or $recovered.outboxPending -ne 0 -or $recovered.cursor -ne '1' -or $barrier.Count -ne 1 -or $pushes.Count -lt 1 -or $beforeRecovery.Count -ne 1 -or $afterRecovery.Count -ne 1 -or $cancellations.Count -ne 1 -or $cancellations[0].runId -ne $runId -or $cancellations[0].scenario -ne $(if ($TerminationBoundary -eq 'before-commit') { 'A' } else { 'B' }) -or $cancellations[0].exePid -ne "$terminationPid" -or $cancellations[0].cancellationSource -notin @('aborted', 'socket-close') -or [string]::IsNullOrWhiteSpace($cancellations[0].cancellationObservedAt) -or $null -ne $cancellations[0].barrierReleasedAt -or $cancellations[0].responseCompleted -or ($cancellations[0].cancellationSource -eq 'socket-close' -and !$cancellations[0].socketDestroyed) -or !$beforeRecovery[0].cancellationObserved -or [string]::IsNullOrWhiteSpace($beforeRecovery[0].barrierReleasedAt) -or $beforeRecovery[0].cancellationObservedAt -gt $beforeRecovery[0].barrierReleasedAt -or $beforeRecovery[0].cancellationSource -ne $cancellations[0].cancellationSource -or $beforeRecovery[0].requestId -ne $cancellations[0].requestId -or $beforeRecovery[0].eventCount -ne $beforeExpectedCount -or $afterRecovery[0].eventCount -ne '1' -or $afterRecovery[0].eventVersion -ne '1' -or $afterRecovery[0].entityVersion -ne '1' -or ($TerminationBoundary -eq 'before-commit' -and $beforeRecovery[0].handlerExecuted) -or ($TerminationBoundary -eq 'after-commit' -and !$beforeRecovery[0].handlerExecuted) -or ($TerminationBoundary -eq 'after-commit' -and $beforeRecovery[0].eventVersion -ne '1') -or ($TerminationBoundary -eq 'after-commit' -and $beforeRecovery[0].entityVersion -ne '1')) { throw "native Push termination result is invalid: $terminationInflightResult / $terminationRecoveredResult / $diagnostics" }
    Write-Output "PASS native HonsenProcure.exe HTTPS Push termination ($TerminationBoundary): pid=$terminationPid $terminationInflightResult / $terminationRecoveredResult"
  } else {
    $offline = Get-Content -Raw $offlineResult | ConvertFrom-Json
    $recovered = Get-Content -Raw $offlineRecoveredResult | ConvertFrom-Json
    $pushRecords = @(Get-Content $diagnostics | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.route -eq 'POST /api/sync/push' -and $_.eventId -eq $offline.eventId })
    if ($offline.mode -ne 'offline-push-recovery' -or $offline.onlineBaseline -ne 'PASS' -or $offline.offlineTransportFailure -ne 'PASS' -or $offline.outboxRetained -ne 'PASS' -or $offline.outboxPendingBeforePush -ne 1 -or $offline.outboxPendingAfterPush -ne 1 -or $recovered.mode -ne 'offline-push-recovery' -or $recovered.restartRetention -ne 'PASS' -or $recovered.recoveredPush -ne 'PASS' -or $recovered.pushReplay -ne 'PASS' -or $recovered.authoritativePull -ne 'PASS' -or $recovered.outboxPendingBeforeRecovery -ne 1 -or $recovered.outboxPendingAfterRecovery -ne 0 -or $recovered.serverEventCount -ne 1 -or $pushRecords.Count -ne 1 -or $pushRecords[0].serverStatus -ne 200 -or $pushRecords[0].origin.origin_account_id -ne $offline.accountId -or $pushRecords[0].origin.origin_installation_id -ne $offline.installationId) {
      throw "native offline Push recovery result is invalid: $offlineResult / $offlineRecoveredResult / $diagnostics"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS offline Push recovery smoke: $offlineResult / $offlineRecoveredResult"
  }
} finally {
  if ($server -and !$server.HasExited) {
    Stop-Process -Id $server.Id -Force
    $server.WaitForExit()
  }
  if ($wslHolder -and !$wslHolder.HasExited) {
    $wslRepo = (& wsl.exe -- wslpath -a $repo.Replace('\', '/')).Trim()
    & wsl.exe -- bash -lc "cd '$wslRepo' && docker compose --project-name $composeProject --env-file .env.test -f compose.test.yaml down --volumes" | Out-Null
    $wslHolder.Refresh()
    if (!$wslHolder.HasExited) { Stop-Process -Id $wslHolder.Id -Force }
  }
  if ($certificate) { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force }
  foreach ($path in $pfx, $cer) { if (Test-Path $path) { Remove-Item -LiteralPath $path -Force } }
}
