param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$SourceSha,
  [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+(\.\d+)?$')][string]$Version,
  [Parameter(Mandatory)][string]$EvidenceRoot
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$cache = [IO.Path]::GetFullPath((Join-Path $repo '.cache'))
$root = [IO.Path]::GetFullPath($EvidenceRoot)
if (-not $root.StartsWith($cache + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Use a new task directory under repository .cache' }
if (Test-Path -LiteralPath $root) { throw 'Evidence directory must be new; preserve earlier runs' }
if ([IO.Path]::GetExtension($Installer) -ne '.exe') { throw 'Installer EXE required' }
$staging = Join-Path $root 'input'
$output = Join-Path $root 'evidence'
New-Item -ItemType Directory -Path $staging,$output -Force | Out-Null
$setup = Join-Path $staging 'Candidate-Setup.exe'
Copy-Item -LiteralPath $Installer -Destination $setup
$hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash
@{ sourceSha=$SourceSha; version=$Version; installer='Candidate-Setup.exe'; sha256=$hash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $staging 'candidate.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'installed-runner-security.ps1') -Destination $staging
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'sandbox-runner-security-guest.ps1') -Destination $staging
$escapedStaging = [Security.SecurityElement]::Escape($staging)
$escapedOutput = [Security.SecurityElement]::Escape($output)
$configuration = "<Configuration><Networking>Disable</Networking><ClipboardRedirection>Disable</ClipboardRedirection><MappedFolders><MappedFolder><HostFolder>$escapedStaging</HostFolder><SandboxFolder>C:\SecurityInput</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder><MappedFolder><HostFolder>$escapedOutput</HostFolder><SandboxFolder>C:\SecurityEvidence</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder></MappedFolders><LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\SecurityInput\sandbox-runner-security-guest.ps1</Command></LogonCommand></Configuration>"
$wsb = Join-Path $root 'security.wsb'
$configuration | Set-Content -LiteralPath $wsb -Encoding UTF8
Start-Process -FilePath $wsb -WindowStyle Hidden
Write-Output "Guest evidence: $output"
