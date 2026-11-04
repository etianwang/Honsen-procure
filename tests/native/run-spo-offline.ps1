[CmdletBinding()]
param([Parameter(Mandatory)][string]$NativeExe, [Parameter(Mandatory)][string]$ProfileExe, [Parameter(Mandatory)][string]$FrontendSnapshot, [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceSha)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$snapshot = (Resolve-Path -LiteralPath $FrontendSnapshot).Path
if (!$snapshot.StartsWith((Join-Path $repo '.cache') + '\') -or !(Test-Path (Join-Path $snapshot 'index.html'))) { throw 'An isolated .cache frontend snapshot is required' }
$env:HONSEN_PROCURE_PROFILE = 'test'
$env:HONSEN_NATIVE_WEBVIEW_TEST = 'config'
$env:HONSEN_PROCURE_NATIVE_EXE = (Resolve-Path -LiteralPath $NativeExe).Path
$env:HONSEN_PROCURE_OFFLINE_FRONTEND = $snapshot
$env:HONSEN_PROCURE_OFFLINE_SOURCE_SHA = $SourceSha
$env:HONSEN_PROCURE_OFFLINE_PROFILE_EXE = (Resolve-Path -LiteralPath $ProfileExe).Path
if ((& git -C $repo rev-parse HEAD).Trim() -ne $SourceSha) { throw 'HEAD does not match declared application source; build corresponding artifacts first' }
$env:HONSEN_PROCURE_TEST_RUN_ID = 'native-smoke-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$qa = Join-Path $repo '.honsen-native-qa'
$env:HONSEN_PROCURE_TEST_DB_PATH = Join-Path $qa ($env:HONSEN_PROCURE_TEST_RUN_ID + '-offline-a.test.sqlite')
$env:HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH = Join-Path $qa ($env:HONSEN_PROCURE_TEST_RUN_ID + '-offline-b.test.sqlite')
$env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH = Join-Path $qa ($env:HONSEN_PROCURE_TEST_RUN_ID + '-offline.test.json')
$env:HONSEN_TEST_ENGINEER_A_PASSWORD = [guid]::NewGuid().ToString('N')
$env:HONSEN_TEST_ENGINEER_B_PASSWORD = [guid]::NewGuid().ToString('N')
$env:HONSEN_TEST_PURCHASER_PASSWORD = [guid]::NewGuid().ToString('N')
$first = $env:HONSEN_PROCURE_TEST_DB_PATH
try {
  foreach ($profile in @($first, $env:HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH)) {
    if (Test-Path -LiteralPath $profile) { throw 'Never reuse an existing profile' }
    $env:HONSEN_PROCURE_TEST_DB_PATH = $profile
    & $ProfileExe seed
    if ($LASTEXITCODE -ne 0) { throw 'Profile seed failed' }
  }
  $env:HONSEN_PROCURE_TEST_DB_PATH = $first
  & node (Join-Path $PSScriptRoot 'spo-offline.mjs')
  if ($LASTEXITCODE -ne 0) { throw "Offline native failed: $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH" }
  Write-Output "PASS scoped offline native: $env:HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH"
} finally {
  Remove-Item Env:HONSEN_TEST_ENGINEER_A_PASSWORD, Env:HONSEN_TEST_ENGINEER_B_PASSWORD, Env:HONSEN_TEST_PURCHASER_PASSWORD -ErrorAction SilentlyContinue
}
