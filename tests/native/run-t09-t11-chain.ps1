[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ResourceRoot,
  [Parameter(Mandatory=$true)][string]$CosEnvFile,
  [string]$EvidenceRoot,
  [string]$HeicFixture,
  [switch]$KeepDatabase,
  [switch]$ExistingDatabase,
  [string]$SandboxId,
  [string]$TestHost = '127.0.0.1',
  [string]$NativeExe
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$resource = (Resolve-Path $ResourceRoot).Path
if (!$EvidenceRoot) { $EvidenceRoot = Join-Path $resource ('native-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')) }
$root = [IO.Path]::GetFullPath($EvidenceRoot)
if (!$root.StartsWith($resource + [IO.Path]::DirectorySeparatorChar) -or (Test-Path $root)) { throw 'Evidence root must be a fresh resource-root child' }
New-Item -ItemType Directory $root | Out-Null
$server = $null; $holder = $null; $certificate = $null
$signalsRoot = if ($SandboxId) { Join-Path $root 'output' } else { $root }
New-Item -ItemType Directory -Force -Path $signalsRoot | Out-Null
$project = 'honsen-t09a-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
function Start-TestServer {
  $proc = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @(('"{0}"' -f (Join-Path $repo 'node_modules/tsx/dist/cli.mjs')), 'src/scripts/native-t09-t11-server.ts') -WorkingDirectory (Join-Path $repo 'apps/server') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root ('server-' + [Guid]::NewGuid() + '.log')) -RedirectStandardError (Join-Path $root ('server-error-' + [Guid]::NewGuid() + '.log'))
  for ($i=0; $i -lt 60; $i++) {
    if ($proc.HasExited) { throw 'Isolated native server exited; inspect evidence logs' }
    $tcp = New-Object Net.Sockets.TcpClient
    try { $tcp.Connect($TestHost,3443); return $proc } catch { Start-Sleep -Milliseconds 500 } finally { $tcp.Dispose() }
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
  if (!$ExistingDatabase) {
  $wslRepo = (& wsl.exe -d Ubuntu -u honsen-dev -- wslpath -a $repo.Replace('\','/')).Trim()
  $command = "cd '$wslRepo' && docker compose --project-name $project --env-file .env.test -f compose.test.yaml up -d --wait && exec tail -f /dev/null"
  $holder = Start-Process wsl.exe -ArgumentList @('-d','Ubuntu','-u','honsen-dev','--','bash','-lc',('"' + $command + '"')) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'compose.log') -RedirectStandardError (Join-Path $root 'compose-error.log')
  for ($i=0; $i -lt 60; $i++) {
    if ($holder.HasExited) { throw 'Compose keepalive exited' }
    $tcp = New-Object Net.Sockets.TcpClient
    try { $tcp.Connect('127.0.0.1',54329); break } catch { Start-Sleep -Milliseconds 500 } finally { $tcp.Dispose() }
  }
  }
  $rsa = [Security.Cryptography.RSA]::Create(2048)
  $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=HonsenNativeTest',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $san.AddDnsName('localhost'); $san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
  if ($TestHost -ne '127.0.0.1') { $san.AddIpAddress([Net.IPAddress]::Parse($TestHost)) }
  $request.CertificateExtensions.Add($san.Build())
  $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
  $certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(1))
  $pfxPassword = [Guid]::NewGuid().ToString('N')
  $pfx = Join-Path $root 'server.pfx'; $pem = Join-Path $root 'server.pem'
  [IO.File]::WriteAllBytes($pfx,$certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,$pfxPassword))
  [IO.File]::WriteAllText($pem,$certificate.ExportCertificatePem())
  $env:HONSEN_PROCURE_TEST_DATABASE_URL = 'postgresql://{0}:{1}@127.0.0.1:{2}/{3}' -f $env:POSTGRES_TEST_USER,[Uri]::EscapeDataString($env:POSTGRES_TEST_PASSWORD),$env:POSTGRES_TEST_PORT,$env:POSTGRES_TEST_DATABASE
  $env:HONSEN_PROCURE_TEST_TLS_PFX=$pfx; $env:HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD=$pfxPassword
  $env:HONSEN_PROCURE_TEST_TLS_CA_PEM=$pem; $env:HONSEN_SYNC_API_BASE_URL="https://${TestHost}:3443"
  $env:HONSEN_PROCURE_TEST_TLS_HOST=$TestHost
  $env:HONSEN_TEST_COS_PREFIX='honsen-procure-tests/' + [Guid]::NewGuid().ToString() + '/'
  foreach ($name in 'ENGINEER_A','ENGINEER_B','PURCHASER','PURCHASER_B') { Set-Item ('Env:HONSEN_TEST_' + $name + '_PASSWORD') ('native-' + [Guid]::NewGuid().ToString('N')) }
  $env:HONSEN_NATIVE_EVIDENCE_ROOT=$root
  $env:HONSEN_NATIVE_RESOURCE_ROOT=$resource
  $env:HONSEN_NATIVE_EXE=if ($NativeExe) { (Resolve-Path $NativeExe).Path } else { Join-Path $resource 'cargo-target/debug/HonsenProcure.exe' }
  if ($HeicFixture) { $env:HONSEN_NATIVE_HEIC_FIXTURE = (Resolve-Path $HeicFixture).Path }
  if ($SandboxId) { $env:HONSEN_NATIVE_CONTROL_ROOT=$signalsRoot }
  $server = Start-TestServer
  if ($SandboxId) {
    $inputRoot=Join-Path $root 'input'
    New-Item -ItemType Directory -Force -Path (Join-Path $inputRoot 'tests/native'),(Join-Path $inputRoot 'bin'),(Join-Path $inputRoot 'node_modules/@playwright') | Out-Null
    Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $inputRoot 'node.exe')
    Copy-Item -LiteralPath $env:HONSEN_NATIVE_EXE -Destination (Join-Path $inputRoot 'bin/HonsenProcure.exe')
    Copy-Item -LiteralPath (Join-Path $resource 'cargo-target/debug/honsen-procure-test-profile.exe') -Destination (Join-Path $inputRoot 'bin/honsen-procure-test-profile.exe')
    Copy-Item -LiteralPath (Join-Path $repo 'tests/native/t09-t11-chain.mjs') -Destination (Join-Path $inputRoot 'tests/native/t09-t11-chain.mjs')
    Copy-Item -LiteralPath (Join-Path $repo 'apps/desktop/dist') -Destination (Join-Path $inputRoot 'frontend') -Recurse
    foreach($module in '@playwright/test','playwright','playwright-core') { Copy-Item -LiteralPath (Join-Path $repo ('node_modules/'+$module)) -Destination (Join-Path $inputRoot ('node_modules/'+$module)) -Recurse }
    Copy-Item -LiteralPath $pem -Destination (Join-Path $inputRoot 'test-ca.pem')
    if($HeicFixture) {Copy-Item -LiteralPath $HeicFixture -Destination (Join-Path $inputRoot 'photo.heic')}
    $guestEnvironment=[ordered]@{
      HONSEN_NATIVE_GUEST='1';HONSEN_PROCURE_PROFILE='test';HONSEN_NATIVE_RESOURCE_ROOT='C:/HonsenNativeTask';HONSEN_NATIVE_EVIDENCE_ROOT=('C:/HonsenNativeTask/'+[Guid]::NewGuid().ToString('N'));
      HONSEN_NATIVE_RESULT_ROOT='C:/HonsenNativeRunOutput';HONSEN_NATIVE_FRONTEND_DIST='C:/HonsenNativeRunInput/frontend';HONSEN_NATIVE_EXE='C:/HonsenNativeRunInput/bin/HonsenProcure.exe';
      HONSEN_PROCURE_TEST_TLS_CA_PEM='C:/HonsenNativeRunInput/test-ca.pem';HONSEN_SYNC_API_BASE_URL=$env:HONSEN_SYNC_API_BASE_URL;HONSEN_NATIVE_BASE_SHA=(& git -C $repo rev-parse HEAD).Trim();
      HONSEN_NATIVE_SOURCE_DIRTY=if((& git -C $repo status --porcelain)){'1'}else{'0'};
      HONSEN_TEST_ENGINEER_A_PASSWORD=$env:HONSEN_TEST_ENGINEER_A_PASSWORD;HONSEN_TEST_ENGINEER_B_PASSWORD=$env:HONSEN_TEST_ENGINEER_B_PASSWORD;HONSEN_TEST_PURCHASER_PASSWORD=$env:HONSEN_TEST_PURCHASER_PASSWORD;HONSEN_TEST_PURCHASER_B_PASSWORD=$env:HONSEN_TEST_PURCHASER_B_PASSWORD
    }
    if($HeicFixture) {$guestEnvironment.HONSEN_NATIVE_HEIC_FIXTURE='C:/HonsenNativeRunInput/photo.heic'}
    $bootstrap=($guestEnvironment.GetEnumerator()|ForEach-Object {"`$env:$($_.Key)='$($_.Value.Replace("'","''"))'"}) -join "`n"
    $bootstrap += "`n& C:/HonsenNativeRunInput/node.exe C:/HonsenNativeRunInput/tests/native/t09-t11-chain.mjs *> C:/HonsenNativeRunOutput/driver.log`n`$code=`$LASTEXITCODE`n@{exitCode=`$code}|ConvertTo-Json|Set-Content C:/HonsenNativeRunOutput/guest-exit.test.json -Encoding UTF8`nexit `$code"
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($bootstrap))
    $package=Get-AppxPackage -Name MicrosoftWindows.WindowsSandbox; $wsb=Join-Path $package.InstallLocation 'wsb.exe'
    & $wsb share --id $SandboxId --host-path $inputRoot --sandbox-path C:/HonsenNativeRunInput --raw | Out-Null
    & $wsb share --id $SandboxId --host-path $signalsRoot --sandbox-path C:/HonsenNativeRunOutput --allow-write --raw | Out-Null
    $driver=Start-Process $wsb -ArgumentList @('exec','--id',$SandboxId,'--run-as','ExistingLogin','--command',('"powershell.exe -NoProfile -EncodedCommand '+$encoded+'"'),'--raw') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'sandbox-driver.log') -RedirectStandardError (Join-Path $root 'sandbox-driver-error.log')
  } else {
  $driver = Start-Process (Get-Command node.exe).Source -ArgumentList ('"{0}"' -f (Join-Path $repo 'tests/native/t09-t11-chain.mjs')) -WorkingDirectory $repo -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'driver.log') -RedirectStandardError (Join-Path $root 'driver-error.log')
  }
  $deadline=(Get-Date).AddMinutes(12)
  while (!$driver.HasExited) {
    if ((Get-Date) -gt $deadline) { Stop-Process -Id $driver.Id; throw 'Native chain exceeded 12 minutes' }
    foreach($cycle in @('','conflict-','resolution-')) {
    if ((Test-Path (Join-Path $signalsRoot ($cycle+'disconnect.signal'))) -and !(Test-Path (Join-Path $signalsRoot ($cycle+'disconnected.signal')))) {
      Stop-Process -Id $server.Id; $server.WaitForExit(); $server=$null
      New-Item -ItemType File (Join-Path $signalsRoot ($cycle+'disconnected.signal')) | Out-Null
    }
    if ((Test-Path (Join-Path $signalsRoot ($cycle+'reconnect.signal'))) -and !(Test-Path (Join-Path $signalsRoot ($cycle+'reconnected.signal')))) {
      $server=Start-TestServer
      New-Item -ItemType File (Join-Path $signalsRoot ($cycle+'reconnected.signal')) | Out-Null
    }
    }
    Start-Sleep -Milliseconds 200
  }
  if ($driver.ExitCode -ne 0) { throw "Native driver failed; inspect $root" }
  if($SandboxId -and (!(Test-Path (Join-Path $signalsRoot 'guest-exit.test.json')) -or (Get-Content (Join-Path $signalsRoot 'guest-exit.test.json') -Raw|ConvertFrom-Json).exitCode -ne 0)) {throw "Sandbox driver failed; inspect $signalsRoot"}
  Get-Content (Join-Path $signalsRoot 'evidence.test.json')
} finally {
  if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id; $server.WaitForExit() }
  # Cleanup is separately validated by the server using this run's exact isolated prefix.
  if ($env:HONSEN_TEST_COS_PREFIX) {
    & node (Join-Path $repo 'node_modules/tsx/dist/cli.mjs') (Join-Path $repo 'apps/server/src/scripts/native-t09-t11-server.ts') --cleanup *> (Join-Path $root 'cleanup.log')
    $cleanupFailed = $LASTEXITCODE -ne 0
  }
  if ($wslRepo -and !$KeepDatabase) { & wsl.exe -d Ubuntu -u honsen-dev -- bash -lc "cd '$wslRepo' && docker compose --project-name $project --env-file .env.test -f compose.test.yaml down --volumes" *> (Join-Path $root 'compose-down.log') }
  if ($holder -and !$holder.HasExited) { Stop-Process -Id $holder.Id }
  if ($certificate) { $certificate.Dispose() }
  if ($rsa) { $rsa.Dispose() }
  if ($pfx -and (Test-Path -LiteralPath $pfx)) { Remove-Item -LiteralPath $pfx }
  foreach ($name in 'COS_SECRET_ID','COS_SECRET_KEY','HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD') { Remove-Item ('Env:'+$name) -ErrorAction SilentlyContinue }
  if ($cleanupFailed) { throw 'Isolated COS cleanup failed; retain exact ownership prefix and inspect cleanup.log' }
}
