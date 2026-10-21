$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$taskRoot = $env:T04_TASK_ROOT
if (!$taskRoot -or !(Test-Path -LiteralPath $taskRoot)) { throw 'T04_TASK_ROOT must name the isolated test runtime directory' }
if (!$env:T04_TEST_DATABASE_URL) { throw 'T04_TEST_DATABASE_URL must identify an isolated loopback test database' }
$target = Join-Path $taskRoot 'target\debug'
$runtime = Join-Path $taskRoot ("desktop-ab-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runtime | Out-Null
$certificate = $null
$server = $null
$vite = $null
foreach ($port in @(1420, 3443, 9235, 9236)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Required test port $port is already in use" }
}
try {
  $env:TEMP = Join-Path $taskRoot 'temp'
  $env:TMP = $env:TEMP
  $env:T04_EXE = Join-Path $target 'HonsenProcure.exe'
  $env:T04_PROFILE_A = Join-Path $runtime 'close-a.test.sqlite'
  $env:T04_PROFILE_B = Join-Path $runtime 'close-b.test.sqlite'
  $env:T04_RESULT = Join-Path $runtime 'close-ab.test.json'
  foreach ($path in @($env:T04_PROFILE_A, $env:T04_PROFILE_B, $env:T04_RESULT)) { if (Test-Path $path) { throw "Refusing to overwrite existing $path" } }
  $env:HONSEN_PROCURE_TEST_DATABASE_URL = $env:T04_TEST_DATABASE_URL
  $env:HONSEN_PROCURE_PROFILE = 'test'
  $env:HONSEN_TEST_ENGINEER_A_PASSWORD = "test-a-$([Guid]::NewGuid().ToString('N'))"
  $env:HONSEN_TEST_ENGINEER_B_PASSWORD = "test-b-$([Guid]::NewGuid().ToString('N'))"
  $env:HONSEN_TEST_PURCHASER_PASSWORD = "test-p-$([Guid]::NewGuid().ToString('N'))"
  $certificate = New-SelfSignedCertificate -DnsName 'localhost', '127.0.0.1' -CertStoreLocation 'Cert:\CurrentUser\My' -Type SSLServerAuthentication -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(1)
  $env:HONSEN_PROCURE_TEST_TLS_PFX = Join-Path $runtime 'close-test.pfx'
  $env:HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD = [Guid]::NewGuid().ToString('N')
  $secure = ConvertTo-SecureString $env:HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD -AsPlainText -Force
  Export-PfxCertificate -Cert $certificate -FilePath $env:HONSEN_PROCURE_TEST_TLS_PFX -Password $secure | Out-Null
  $cer = Join-Path $runtime 'close-test.cer'
  $env:HONSEN_PROCURE_TEST_TLS_CA_PEM = Join-Path $runtime 'close-test.pem'
  Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
  & certutil.exe -encode $cer $env:HONSEN_PROCURE_TEST_TLS_CA_PEM | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create test PEM' }
  $env:HONSEN_PROCURE_TEST_TLS_PORT = '3443'
  $env:HONSEN_SYNC_API_BASE_URL = 'https://localhost:3443'
  $env:HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH = Join-Path $runtime 'close-server.test.jsonl'
  foreach ($profile in @($env:T04_PROFILE_A, $env:T04_PROFILE_B)) {
    $env:HONSEN_PROCURE_TEST_DB_PATH = $profile
    & (Join-Path $target 'honsen-procure-test-profile.exe') seed
    if ($LASTEXITCODE -ne 0) { throw 'Test profile seed failed' }
  }
  $node = (Get-Command node.exe).Source
  $tsx = Join-Path $repo 'node_modules\tsx\dist\cli.mjs'
  $server = Start-Process $node -ArgumentList "`"$tsx`" src/scripts/native-test-server.ts" -WorkingDirectory (Join-Path $repo 'apps\server') -RedirectStandardOutput (Join-Path $runtime 'close-server.log') -RedirectStandardError (Join-Path $runtime 'close-server-error.log') -PassThru -WindowStyle Hidden
  $viteCli = Join-Path $repo 'node_modules\vite\bin\vite.js'
  $vite = Start-Process $node -ArgumentList "`"$viteCli`" --host 127.0.0.1 --port 1420 --strictPort" -WorkingDirectory (Join-Path $repo 'apps\desktop') -RedirectStandardOutput (Join-Path $runtime 'close-vite.log') -RedirectStandardError (Join-Path $runtime 'close-vite-error.log') -PassThru -WindowStyle Hidden
  foreach ($port in @(3443, 1420)) {
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
      if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
      Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw "Test server port $port not ready" }
  }
  & $node (Join-Path $PSScriptRoot 't04-fix2-desktop-ab.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'T04 native A/B driver failed; inspect result and logs' }
} finally {
  if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id }
  if ($vite -and !$vite.HasExited) { Stop-Process -Id $vite.Id }
  if ($certificate) { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" }
}
