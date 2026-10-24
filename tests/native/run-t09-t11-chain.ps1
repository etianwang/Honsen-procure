[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ResourceRoot,
  [Parameter(Mandatory=$true)][string]$CosEnvFile,
  [string]$EvidenceRoot,
  [string]$HeicFixture,
  [switch]$KeepDatabase
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$resource = (Resolve-Path $ResourceRoot).Path
if (!$EvidenceRoot) { $EvidenceRoot = Join-Path $resource ('native-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')) }
$root = [IO.Path]::GetFullPath($EvidenceRoot)
if (!$root.StartsWith($resource + [IO.Path]::DirectorySeparatorChar) -or (Test-Path $root)) { throw 'Evidence root must be a fresh resource-root child' }
New-Item -ItemType Directory $root | Out-Null
$server = $null; $holder = $null; $certificate = $null
$project = 'honsen-t09a-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
function Start-TestServer {
  $proc = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @(('"{0}"' -f (Join-Path $repo 'node_modules/tsx/dist/cli.mjs')), 'src/scripts/native-t09-t11-server.ts') -WorkingDirectory (Join-Path $repo 'apps/server') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root ('server-' + [Guid]::NewGuid() + '.log')) -RedirectStandardError (Join-Path $root ('server-error-' + [Guid]::NewGuid() + '.log'))
  for ($i=0; $i -lt 60; $i++) {
    if ($proc.HasExited) { throw 'Isolated native server exited; inspect evidence logs' }
    $tcp = New-Object Net.Sockets.TcpClient
    try { $tcp.Connect('127.0.0.1',3443); return $proc } catch { Start-Sleep -Milliseconds 500 } finally { $tcp.Dispose() }
  }
  throw 'Native HTTPS server unavailable'
}
try {
  foreach ($line in Get-Content (Join-Path $repo '.env.test')) {
    if ($line -match '^(POSTGRES_TEST_[A-Z_]+)=(.*)$') { Set-Item ('Env:' + $Matches[1]) $Matches[2] }
  }
  # Only explicitly authorized COS keys enter this controlled process; deployment DB settings never do.
  foreach ($line in Get-Content $CosEnvFile) {
    if ($line -match '^(COS_REGION|COS_BUCKET|COS_SECRET_ID|COS_SECRET_KEY)=(.*)$') { Set-Item ('Env:' + $Matches[1]) $Matches[2].Trim().Trim('"').Trim("'") }
  }
  $wslRepo = (& wsl.exe -d Ubuntu -u honsen-dev -- wslpath -a $repo.Replace('\','/')).Trim()
  $command = "cd '$wslRepo' && docker compose --project-name $project --env-file .env.test -f compose.test.yaml up -d --wait && exec tail -f /dev/null"
  $holder = Start-Process wsl.exe -ArgumentList @('-d','Ubuntu','-u','honsen-dev','--','bash','-lc',('"' + $command + '"')) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'compose.log') -RedirectStandardError (Join-Path $root 'compose-error.log')
  for ($i=0; $i -lt 60; $i++) {
    if ($holder.HasExited) { throw 'Compose keepalive exited' }
    $tcp = New-Object Net.Sockets.TcpClient
    try { $tcp.Connect('127.0.0.1',54329); break } catch { Start-Sleep -Milliseconds 500 } finally { $tcp.Dispose() }
  }
  $certificate = New-SelfSignedCertificate -DnsName 'localhost','127.0.0.1' -CertStoreLocation 'Cert:\CurrentUser\My' -Type SSLServerAuthentication -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(1)
  $pfxPassword = [Guid]::NewGuid().ToString('N')
  $pfx = Join-Path $root 'server.pfx'; $cer = Join-Path $root 'server.cer'; $pem = Join-Path $root 'server.pem'
  Export-PfxCertificate -Cert $certificate -FilePath $pfx -Password (ConvertTo-SecureString $pfxPassword -AsPlainText -Force) | Out-Null
  Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
  & certutil.exe -encode $cer $pem | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PEM encoding failed' }
  $env:HONSEN_PROCURE_TEST_DATABASE_URL = 'postgresql://{0}:{1}@127.0.0.1:{2}/{3}' -f $env:POSTGRES_TEST_USER,[Uri]::EscapeDataString($env:POSTGRES_TEST_PASSWORD),$env:POSTGRES_TEST_PORT,$env:POSTGRES_TEST_DATABASE
  $env:HONSEN_PROCURE_TEST_TLS_PFX=$pfx; $env:HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD=$pfxPassword
  $env:HONSEN_PROCURE_TEST_TLS_CA_PEM=$pem; $env:HONSEN_SYNC_API_BASE_URL='https://localhost:3443'
  $env:HONSEN_TEST_COS_PREFIX='honsen-procure-tests/' + [Guid]::NewGuid().ToString() + '/'
  foreach ($name in 'ENGINEER_A','ENGINEER_B','PURCHASER') { Set-Item ('Env:HONSEN_TEST_' + $name + '_PASSWORD') ('native-' + [Guid]::NewGuid().ToString('N')) }
  $env:HONSEN_NATIVE_EVIDENCE_ROOT=$root
  $env:HONSEN_NATIVE_RESOURCE_ROOT=$resource
  $env:HONSEN_NATIVE_EXE=Join-Path $resource 'cargo-target/debug/HonsenProcure.exe'
  if ($HeicFixture) { $env:HONSEN_NATIVE_HEIC_FIXTURE = (Resolve-Path $HeicFixture).Path }
  $server = Start-TestServer
  $driver = Start-Process (Get-Command node.exe).Source -ArgumentList ('"{0}"' -f (Join-Path $repo 'tests/native/t09-t11-chain.mjs')) -WorkingDirectory $repo -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'driver.log') -RedirectStandardError (Join-Path $root 'driver-error.log')
  $deadline=(Get-Date).AddMinutes(12)
  while (!$driver.HasExited) {
    if ((Get-Date) -gt $deadline) { Stop-Process -Id $driver.Id; throw 'Native chain exceeded 12 minutes' }
    if ((Test-Path (Join-Path $root 'disconnect.signal')) -and !(Test-Path (Join-Path $root 'disconnected.signal'))) {
      Stop-Process -Id $server.Id; $server.WaitForExit(); $server=$null
      New-Item -ItemType File (Join-Path $root 'disconnected.signal') | Out-Null
    }
    if ((Test-Path (Join-Path $root 'reconnect.signal')) -and !(Test-Path (Join-Path $root 'reconnected.signal'))) {
      $server=Start-TestServer
      New-Item -ItemType File (Join-Path $root 'reconnected.signal') | Out-Null
    }
    Start-Sleep -Milliseconds 200
  }
  if ($driver.ExitCode -ne 0) { throw "Native driver failed; inspect $root" }
  Get-Content (Join-Path $root 'evidence.test.json')
} finally {
  if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id; $server.WaitForExit() }
  # Cleanup is separately validated by the server using this run's exact isolated prefix.
  if ($env:HONSEN_TEST_COS_PREFIX) {
    & node (Join-Path $repo 'node_modules/tsx/dist/cli.mjs') (Join-Path $repo 'apps/server/src/scripts/native-t09-t11-server.ts') --cleanup *> (Join-Path $root 'cleanup.log')
    $cleanupFailed = $LASTEXITCODE -ne 0
  }
  if ($wslRepo -and !$KeepDatabase) { & wsl.exe -d Ubuntu -u honsen-dev -- bash -lc "cd '$wslRepo' && docker compose --project-name $project --env-file .env.test -f compose.test.yaml down --volumes" *> (Join-Path $root 'compose-down.log') }
  if ($holder -and !$holder.HasExited) { Stop-Process -Id $holder.Id }
  if ($certificate) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) }
  if ($pfx -and (Test-Path -LiteralPath $pfx)) { Remove-Item -LiteralPath $pfx }
  foreach ($name in 'COS_SECRET_ID','COS_SECRET_KEY','HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD') { Remove-Item ('Env:'+$name) -ErrorAction SilentlyContinue }
  if ($cleanupFailed) { throw 'Isolated COS cleanup failed; retain exact ownership prefix and inspect cleanup.log' }
}
