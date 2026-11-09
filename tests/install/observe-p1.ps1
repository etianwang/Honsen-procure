param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$ExpectedSha256,
  [Parameter(Mandatory)][string]$InstallDirectory,
  [Parameter(Mandatory)][string]$OutputPath,
  [switch]$UseDefaultDirectory
)
$ErrorActionPreference = 'Stop'
# Guest-only safety gate. Never map a source root or credential directory.
if ($env:USERNAME -ne 'WDAGUtilityAccount') { throw 'Run only inside Windows Sandbox' }
if ((Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash -ne $ExpectedSha256) { throw 'Installer digest mismatch' }
if ($InstallDirectory -notmatch '^[A-Za-z]:\\' -or $InstallDirectory -match '["\r\n]') { throw 'Invalid guest path' }
foreach ($hive in @('HKLM:', 'HKCU:')) {
  foreach ($key in @('Software\Honsen Program\Apps\honsen.procure', 'Software\WOW6432Node\Honsen Program\Apps\honsen.procure')) {
    if (Test-Path "$hive\$key") { throw 'Guest already registered; use a fresh Sandbox' }
  }
}
$started = [DateTime]::UtcNow.ToString('o')
$arguments = if ($UseDefaultDirectory) { '/S' } else { "/S /D=$InstallDirectory" }
$process = Start-Process -FilePath $Installer -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
$registration = Get-ItemProperty 'HKLM:\Software\Honsen Program\Apps\honsen.procure'
$uninstall = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\HonsenProcure'
$files = @('HonsenProcure.exe', 'HonsenUpdateRunner.exe', 'honsen.app.json', 'uninstall.exe') | ForEach-Object {
  @{ name = $_; exists = (Test-Path -LiteralPath (Join-Path $InstallDirectory $_)) }
}
$passed = $process.ExitCode -eq 0 -and @($files | Where-Object { -not $_.exists }).Count -eq 0 -and $registration.InstallLocation.TrimEnd('\') -eq $InstallDirectory.TrimEnd('\') -and $uninstall.InstallLocation.TrimEnd('\') -eq $InstallDirectory.TrimEnd('\') -and $registration.ExecutablePath -eq (Join-Path $InstallDirectory 'HonsenProcure.exe') -and $registration.UpdateRunnerPath -eq (Join-Path $InstallDirectory 'HonsenUpdateRunner.exe')
@{ startedUtc = $started; completedUtc = [DateTime]::UtcNow.ToString('o'); os = [Environment]::OSVersion.VersionString; installerSha256 = $ExpectedSha256; exitCode = $process.ExitCode; directory = $InstallDirectory; files = $files; registration = ($registration | Select-Object AppId,Version,InstallLocation,ExecutablePath,LauncherPath,UpdateRunnerPath); uninstall = ($uninstall | Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString,QuietUninstallString); passed = $passed; scope = 'first-install directory consistency only; upgrade/uninstall NOT RUN' } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
if (-not $passed) { throw 'P1 directory consistency failed; retain guest and evidence' }
