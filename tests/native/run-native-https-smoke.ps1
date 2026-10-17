[CmdletBinding()]
param(
  [ValidateSet('ab-sync-security', 'pull-recovery', 'offline-push-recovery')]
  [string]$Mode = 'ab-sync-security'
)

$ErrorActionPreference = 'Stop'
if (!(Test-Path 'Cert:\CurrentUser\My')) { throw 'CurrentUser certificate store is unavailable for native HTTPS test trust' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runId = "native-smoke-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))"
$qaRoot = Join-Path $repo '.honsen-native-qa'
$logRoot = Join-Path $repo 'test-results'
$profileA = Join-Path $qaRoot "$runId-account-a.test.sqlite"
$profileB = Join-Path $qaRoot "$runId-account-b.test.sqlite"
$result = Join-Path $qaRoot "$runId.test.json"
$interruptedResult = Join-Path $qaRoot "$runId-pull-interrupted.test.json"
$recoveredResult = Join-Path $qaRoot "$runId-pull-recovered.test.json"
$offlineResult = Join-Path $qaRoot "$runId-offline-push.test.json"
$offlineRecoveredResult = Join-Path $qaRoot "$runId-offline-push-recovered.test.json"
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

  $wslRepo = (& wsl.exe -- wslpath -a $repo).Trim()
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
    if ($Mode -eq 'ab-sync-security') {
      $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $result
      & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *> $nativeLog
      if ($LASTEXITCODE -ne 0) { throw "native HonsenProcure.exe smoke failed; inspect $nativeLog" }
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
  if ($Mode -eq 'ab-sync-security') {
    $smoke = Get-Content -Raw $result | ConvertFrom-Json
    if ($smoke.mode -ne 'ab-sync-security' -or $smoke.independentInstallations -ne 'PASS' -or $smoke.forgedDeviceIdTrustedOrigin -ne 'PASS' -or $smoke.accountIsolation -ne 'PASS' -or $smoke.conflictIsolation -ne 'PASS' -or $smoke.pushReplayIdempotency -ne 'PASS') {
      throw "native smoke result is invalid: $result"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS A/B sync security smoke: $result"
  } elseif ($Mode -eq 'pull-recovery') {
    $interrupted = Get-Content -Raw $interruptedResult | ConvertFrom-Json
    $recovered = Get-Content -Raw $recoveredResult | ConvertFrom-Json
    if ($interrupted.mode -ne 'pull-recovery' -or $interrupted.pullFailure -ne 'PASS' -or $interrupted.cursorUnchanged -ne 'PASS' -or $recovered.mode -ne 'pull-recovery' -or $recovered.recovery -ne 'PASS' -or $recovered.replay -ne 'PASS' -or $recovered.cursorPersisted -ne 'PASS') {
      throw "native Pull recovery result is invalid: $interruptedResult / $recoveredResult"
    }
    Write-Output "PASS native HonsenProcure.exe HTTPS Pull recovery smoke: $interruptedResult / $recoveredResult"
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
    $wslRepo = (& wsl.exe -- wslpath -a $repo).Trim()
    & wsl.exe -- bash -lc "cd '$wslRepo' && docker compose --project-name $composeProject --env-file .env.test -f compose.test.yaml down --volumes" | Out-Null
    $wslHolder.Refresh()
    if (!$wslHolder.HasExited) { Stop-Process -Id $wslHolder.Id -Force }
  }
  if ($certificate) { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force }
  foreach ($path in $pfx, $cer) { if (Test-Path $path) { Remove-Item -LiteralPath $path -Force } }
}
