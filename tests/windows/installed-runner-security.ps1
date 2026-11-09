param(
  [Parameter(Mandatory)][string]$InstallDirectory,
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$ExpectedVersion,
  [Parameter(Mandatory)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount') { throw 'Windows Sandbox only' }
$key = 'HKLM:\Software\Honsen Program\Apps\honsen.procure'
$before = Get-ItemProperty $key
if ($before.InstallLocation.TrimEnd('\') -ne $InstallDirectory.TrimEnd('\')) { throw 'Registered directory mismatch' }
if (@(Get-Process HonsenProcure -ErrorAction SilentlyContinue).Count) { throw 'Close guest client before negative checks' }
$canonical = 'https://api.github.com/repos/etianwang/Honsen-procure/releases/latest'
$manifest = Get-Content -LiteralPath (Join-Path $InstallDirectory 'honsen.app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.updateManifestUrl -ne $canonical -or $before.UpdateManifestUrl -ne $canonical -or $before.UpdateUrl -ne $canonical) { throw 'Canonical source mismatch' }
$names = @('HonsenProcure.exe', 'HonsenUpdateRunner.exe', 'honsen.app.json')
$hashes = @{}
foreach ($name in $names) { $hashes[$name] = (Get-FileHash -LiteralPath (Join-Path $InstallDirectory $name)).Hash }
$digest = (Get-FileHash -LiteralPath $Installer).Hash
$wrongDigest = if ($digest -eq ('0' * 64)) { '1' * 64 } else { '0' * 64 }
$foreign = Start-Process powershell.exe -ArgumentList '-NoProfile -Command Start-Sleep -Seconds 180' -WindowStyle Hidden -PassThru
$results = @()
$failureMessage = $null
try {
  foreach ($case in @('hash', 'target', 'pid')) {
    $operation = [guid]::NewGuid().ToString()
    $resultPath = Join-Path $env:LOCALAPPDATA "Honsen Program\UpdateResults\honsen.procure\$operation.json"
    $hash = if ($case -eq 'hash') { $wrongDigest } else { $digest }
    $target = if ($case -eq 'target') { Join-Path $env:TEMP 'SyntheticWrongTarget' } else { $InstallDirectory }
    $waitPid = if ($case -eq 'pid') { $foreign.Id } else { 0 }
    $arguments = "apply --source toolbox --app-id honsen.procure --wait-pid $waitPid --installer `"$Installer`" --sha256 $hash --target-dir `"$target`" --expected-version $ExpectedVersion --restart true --operation-id $operation --result-path `"$resultPath`""
    $process = Start-Process -FilePath (Join-Path $InstallDirectory 'HonsenUpdateRunner.exe') -ArgumentList $arguments -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit(90000)) { throw 'Runner timeout after 90 seconds; inspect owned guest process before cleanup' }
    $result = Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $after = Get-ItemProperty $key
    $unchanged = $after.InstallLocation -eq $before.InstallLocation -and $after.Version -eq $before.Version
    foreach ($name in $names) { $unchanged = $unchanged -and ((Get-FileHash -LiteralPath (Join-Path $InstallDirectory $name)).Hash -eq $hashes[$name]) }
    $foreign.Refresh()
    $expectedStep = switch ($case) { 'hash' { 'hash-validation' } 'target' { 'identity-validation' } 'pid' { 'wait-process' } }
    $passed = $process.ExitCode -ne 0 -and $result.status -eq 'failed' -and $result.step -eq $expectedStep -and $result.operationId -eq $operation -and $result.appId -eq 'honsen.procure' -and $result.source -eq 'toolbox' -and $unchanged -and -not $foreign.HasExited -and @(Get-Process HonsenProcure -ErrorAction SilentlyContinue).Count -eq 0
    $results += @{ case=$case; passed=$passed; exitCode=$process.ExitCode; result=$result; filesAndRegistrationUnchanged=$unchanged }
    if (-not $passed) { throw "Installed Runner negative case failed: $case" }
  }
} catch {
  $failureMessage = $_.Exception.Message
  throw
} finally {
  $foreign.Refresh()
  if (-not $foreign.HasExited) { $foreign.Kill(); $foreign.WaitForExit() }
  @{ scope='installed Runner negative checks only'; failureMessage=$failureMessage; runResult=$(if ($failureMessage) { 'FAIL' } else { 'PASS' }); version=$before.Version; installerSha256=$digest; results=$results; completedUtc=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}
