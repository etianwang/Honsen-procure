[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runId = "native-smoke-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))"
$qaRoot = Join-Path $repo '.honsen-native-qa'
$logRoot = Join-Path $repo 'test-results'
$profileA = Join-Path $qaRoot "$runId-account-a.test.sqlite"
$profileB = Join-Path $qaRoot "$runId-account-b.test.sqlite"
$result = Join-Path $qaRoot "$runId.test.json"
$pfx = Join-Path $qaRoot "$runId.pfx"
$cer = Join-Path $qaRoot "$runId.cer"
$pem = Join-Path $qaRoot "$runId.pem"
$serverLog = Join-Path $logRoot "$runId-server.log"
$serverErrorLog = Join-Path $logRoot "$runId-server-error.log"
$composeLog = Join-Path $logRoot "$runId-compose.log"
$composeErrorLog = Join-Path $logRoot "$runId-compose-error.log"
$nativeLog = Join-Path $logRoot "$runId-client.log"
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
  $env:HONSEN_PROCURE_TEST_FAIL_FIRST_PUSH_RESPONSE = '1'

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
    $env:HONSEN_PROCURE_NATIVE_SMOKE = 'ab-sync-security'
    $env:HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH = $profileB
    $env:HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD = $env:HONSEN_TEST_ENGINEER_A_PASSWORD
    $env:HONSEN_PROCURE_NATIVE_AB_ENGINEER_B_PASSWORD = $env:HONSEN_TEST_ENGINEER_B_PASSWORD
    $env:HONSEN_PROCURE_NATIVE_AB_PURCHASER_PASSWORD = $env:HONSEN_TEST_PURCHASER_PASSWORD
    $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = $result
    $env:RUST_BACKTRACE = '1'
    & (Join-Path $desktop 'target\debug\HonsenProcure.exe') *> $nativeLog
    if ($LASTEXITCODE -ne 0) { throw "native HonsenProcure.exe smoke failed; inspect $nativeLog" }
  } finally {
    Pop-Location
  }
  $smoke = Get-Content -Raw $result | ConvertFrom-Json
  if ($smoke.mode -ne 'ab-sync-security' -or $smoke.independentInstallations -ne 'PASS' -or $smoke.forgedDeviceIdTrustedOrigin -ne 'PASS' -or $smoke.accountIsolation -ne 'PASS' -or $smoke.conflictIsolation -ne 'PASS' -or $smoke.pushReplayIdempotency -ne 'PASS') {
    throw "native smoke result is invalid: $result"
  }
  Write-Output "PASS native HonsenProcure.exe HTTPS A/B sync security smoke: $result"
} finally {
  if ($server -and !$server.HasExited) {
    Stop-Process -Id $server.Id -Force
    $server.WaitForExit()
  }
  if ($wslHolder -and !$wslHolder.HasExited) {
    $wslRepo = (& wsl.exe -- wslpath -a $repo).Trim()
    & wsl.exe -- bash -lc "cd '$wslRepo' && docker compose --project-name $composeProject --env-file .env.test -f compose.test.yaml down --volumes" | Out-Null
    Stop-Process -Id $wslHolder.Id -Force
  }
  if ($certificate) { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force }
  foreach ($path in $pfx, $cer) { if (Test-Path $path) { Remove-Item -LiteralPath $path -Force } }
}
