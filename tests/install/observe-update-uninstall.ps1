param(
  [Parameter(Mandatory)][ValidateSet('Upgrade','Uninstall')][string]$Mode,
  [Parameter(Mandatory)][string]$InstallDirectory,
  [Parameter(Mandatory)][string]$OutputPath,
  [string]$Installer,
  [string]$ExpectedSha256,
  [string]$ExpectedVersion
)
$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount') { throw 'Sandbox only' }
$registrationPath = 'HKLM:\Software\Honsen Program\Apps\honsen.procure'
$before = Get-ItemProperty $registrationPath
if ($before.InstallLocation.TrimEnd('\') -ne $InstallDirectory.TrimEnd('\')) { throw 'Original directory mismatch' }
$sentinel = Join-Path $env:LOCALAPPDATA 'Honsen Program\honsen.procure\p1-retain.txt'
New-Item -ItemType Directory -Path (Split-Path $sentinel) -Force | Out-Null
Set-Content -LiteralPath $sentinel -Value 'synthetic retained data'
$sibling = Join-Path (Split-Path $InstallDirectory) 'P1 synthetic sibling'
New-Item -ItemType Directory -Path $sibling -Force | Out-Null
$siblingFile = Join-Path $sibling 'retain.txt'
Set-Content -LiteralPath $siblingFile -Value 'synthetic sibling'
$result = $null
if ($Mode -eq 'Upgrade') {
  if (-not $ExpectedVersion -or (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash -ne $ExpectedSha256) { throw 'Invalid candidate version/digest' }
  $operation = [Guid]::NewGuid().ToString()
  $resultPath = Join-Path $env:LOCALAPPDATA "Honsen Program\UpdateResults\honsen.procure\$operation.json"
  $arguments = "apply --source toolbox --app-id honsen.procure --wait-pid 0 --installer `"$Installer`" --sha256 $ExpectedSha256 --target-dir `"$InstallDirectory`" --expected-version $ExpectedVersion --restart false --operation-id $operation --result-path `"$resultPath`""
  $process = Start-Process -FilePath (Join-Path $InstallDirectory 'HonsenUpdateRunner.exe') -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
  $after = Get-ItemProperty $registrationPath
  $passed = $process.ExitCode -eq 0 -and $result.status -eq 'success' -and $after.InstallLocation -eq $before.InstallLocation -and $after.Version -eq $ExpectedVersion -and (Test-Path -LiteralPath $result.installerLogPath)
  foreach ($name in @('HonsenProcure.exe','HonsenUpdateRunner.exe','honsen.app.json','uninstall.exe')) { $passed = $passed -and (Test-Path -LiteralPath (Join-Path $InstallDirectory $name)) }
} else {
  $process = Start-Process -FilePath (Join-Path $InstallDirectory 'uninstall.exe') -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  $passed = $process.ExitCode -eq 0 -and -not (Test-Path $registrationPath)
}
$passed = $passed -and (Test-Path -LiteralPath $sentinel) -and (Test-Path -LiteralPath $siblingFile) -and (Test-Path -LiteralPath (Split-Path $InstallDirectory))
@{ mode=$Mode; passed=$passed; exitCode=$process.ExitCode; operationResult=$result; completedUtc=[DateTime]::UtcNow.ToString('o'); os=[Environment]::OSVersion.VersionString; scope='synthetic guest only; no automatic rollback claim' } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
if (-not $passed) { throw 'Guest update/uninstall observation failed' }
