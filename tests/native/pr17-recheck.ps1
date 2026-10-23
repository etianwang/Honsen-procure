$ErrorActionPreference = 'Stop'
$repo = 'E:\Project\honsen-pr17-recheck-target'
$root = 'E:\Project\honsen-pr17-recheck-cache'
$oldRoot = 'E:\Project\honsen-pr17-qa-cache'
$env:npm_config_cache = Join-Path $root 'npm'
$env:CARGO_TARGET_DIR = Join-Path $root 'cargo-target'
$env:TEMP = Join-Path $root 'temp'
$env:TMP = $env:TEMP
$env:HONSEN_PROCURE_PROFILE = 'test'
$env:HONSEN_PROCURE_TEST_DATABASE_URL = 'postgresql://qa_pr17@127.0.0.1:54341/honsen_native_recheck3_test'
$env:HONSEN_PROCURE_TEST_TLS_PORT = '3443'
$env:HONSEN_TEST_ENGINEER_A_PASSWORD = 'Synthetic-QA-engineer-a-2026'
$env:HONSEN_TEST_ENGINEER_B_PASSWORD = 'Synthetic-QA-engineer-b-2026'
$env:HONSEN_TEST_PURCHASER_PASSWORD = 'Synthetic-QA-purchaser-2026'
$env:HONSEN_PROCURE_TEST_RUN_ID = 'native-smoke-20261022235900'
$env:HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH = Join-Path $root 'followup.test.jsonl'
$env:HONSEN_QA_EXE = Join-Path $root 'cargo-target/debug/HonsenProcure.exe'
$env:HONSEN_QA_ROOT = $root
$env:HONSEN_SYNC_API_BASE_URL = 'https://localhost:3443'
$pfx = Join-Path $root 'recheck5.pfx'
$cer = Join-Path $root 'recheck5.cer'
$pem = Join-Path $root 'recheck5.pem'
$password = [Guid]::NewGuid().ToString('N')
$certificate = $null
$server = $null
$vite = $null
try {
  $certificate = New-SelfSignedCertificate -DnsName 'localhost', '127.0.0.1' -CertStoreLocation 'Cert:\CurrentUser\My' -Type SSLServerAuthentication -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(1)
  Export-PfxCertificate -Cert $certificate -FilePath $pfx -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
  Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
  & certutil.exe -encode $cer $pem | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'certificate encoding failed' }
  $env:HONSEN_PROCURE_TEST_TLS_PFX = $pfx
  $env:HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD = $password
  $env:HONSEN_PROCURE_TEST_TLS_CA_PEM = $pem
  $env:NODE_EXTRA_CA_CERTS = $pem
  foreach ($name in @('producer5', 'receiver5')) {
    $env:HONSEN_PROCURE_TEST_DB_PATH = Join-Path $root "followup-$name.test.sqlite"
    if (Test-Path $env:HONSEN_PROCURE_TEST_DB_PATH) { throw 'fresh test profile required' }
    $source = if ($name -eq 'producer5') { 'supplier-05.test.sqlite' } else { 'supplier-06.test.sqlite' }
    Copy-Item -LiteralPath (Join-Path $oldRoot $source) -Destination $env:HONSEN_PROCURE_TEST_DB_PATH
    & (Join-Path $root 'cargo-target/debug/honsen-procure-test-profile.exe') seed
    if ($LASTEXITCODE -ne 0) { throw 'profile seed failed' }
  }
  $server = Start-Process node.exe -ArgumentList @('"' + (Join-Path $repo 'node_modules/tsx/dist/cli.mjs') + '"', 'src/scripts/native-test-server.ts') -WorkingDirectory (Join-Path $repo 'apps/server') -RedirectStandardOutput (Join-Path $root 'followup-server.log') -RedirectStandardError (Join-Path $root 'followup-server-error.log') -PassThru -WindowStyle Hidden
  $vite = Start-Process node.exe -ArgumentList @('"' + (Join-Path $repo 'node_modules/vite/bin/vite.js') + '"', '--host', '127.0.0.1', '--port', '1421', '--strictPort') -WorkingDirectory (Join-Path $repo 'apps/desktop') -RedirectStandardOutput (Join-Path $root 'followup-vite.log') -RedirectStandardError (Join-Path $root 'followup-vite-error.log') -PassThru -WindowStyle Hidden
  for ($i = 0; $i -lt 120; $i++) {
    if ($server.HasExited -or $vite.HasExited) { throw 'test server or Vite exited; inspect task logs' }
    if ((Test-NetConnection 127.0.0.1 -Port 3443 -InformationLevel Quiet) -and (Test-NetConnection 127.0.0.1 -Port 1421 -InformationLevel Quiet)) { break }
    Start-Sleep -Milliseconds 500
  }
  if (!(Test-NetConnection 127.0.0.1 -Port 3443 -InformationLevel Quiet)) { throw 'test HTTPS server not ready' }
  node (Join-Path $PSScriptRoot 'pr17-recheck.mjs')
  if ($LASTEXITCODE -ne 0) { throw "native QA driver failed: $LASTEXITCODE" }
} finally {
  foreach ($process in @($server, $vite)) { if ($process -and !$process.HasExited) { Stop-Process -Id $process.Id -Force; $process.WaitForExit() } }
  if ($certificate) { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force }
  foreach ($file in @($pfx, $cer)) { if (Test-Path $file) { Remove-Item -LiteralPath $file -Force } }
}
