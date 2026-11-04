$ErrorActionPreference = 'Stop'
$output = 'C:\SecurityEvidence'
$summary = @{ status='FAIL'; scope='installed Runner negative checks, offline Sandbox only' }
try {
  if ($env:USERNAME -ne 'WDAGUtilityAccount') { throw 'Windows Sandbox only' }
  $candidate = Get-Content C:\SecurityInput\candidate.json -Raw -Encoding UTF8 | ConvertFrom-Json
  $setup = 'C:\SecurityInput\Candidate-Setup.exe'
  if ((Get-FileHash -LiteralPath $setup).Hash -ne $candidate.sha256) { throw 'Candidate checksum mismatch' }
  $directory = 'C:\Honsen Security Synthetic\Honsen Procure'
  $process = Start-Process -FilePath $setup -ArgumentList "/S /D=$directory" -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit(180000)) { throw 'Guest setup timed out' }
  if ($process.ExitCode -ne 0) { throw "Guest setup failed: $($process.ExitCode)" }
  $manifest = Get-Content -LiteralPath (Join-Path $directory 'honsen.app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.version -ne $candidate.version) { throw 'Installed manifest version mismatch' }
  $registration = Get-ItemProperty 'HKLM:\Software\Honsen Program\Apps\honsen.procure'
  $binaryVersion = (Get-Item -LiteralPath (Join-Path $directory 'HonsenProcure.exe')).VersionInfo.ProductVersion
  if ($registration.Version -ne $candidate.version -or $binaryVersion -notmatch ('^' + [regex]::Escape($candidate.version) + '(\.0)?$')) { throw 'Installed binary/registration version mismatch' }
  & C:\SecurityInput\installed-runner-security.ps1 -InstallDirectory $directory -Installer $setup -ExpectedVersion $candidate.version -OutputPath "$output\runner-negative.json"
  $files = @{}
  foreach ($name in @('HonsenProcure.exe','HonsenUpdateRunner.exe','honsen.app.json')) { $files[$name] = (Get-FileHash -LiteralPath (Join-Path $directory $name)).Hash }
  $summary = @{ status='PASS'; scope='installed Runner negative checks only, not full application security'; sourceSha=$candidate.sourceSha; version=$candidate.version; installerSha256=$candidate.sha256; installedFiles=$files; os=[Environment]::OSVersion.VersionString; completedUtc=[DateTime]::UtcNow.ToString('o'); remaining='authentication/roles/projects/attachments/HTTPS/Toolbox joint caller not tested'; cleanup='Synthetic guest install retained until Sandbox closes; no host install or user data changed' }
} catch {
  $summary.error = $_.Exception.Message
} finally {
  $summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath "$output\summary.json" -Encoding UTF8
}
