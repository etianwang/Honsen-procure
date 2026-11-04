# Installed Runner security — 2026-11-04

Status: NOT RUN (awaiting the current-source installation candidate).

The new `tests/windows/installed-runner-security.ps1` runs only as Windows Sandbox's WDAGUtilityAccount. It requires a previously installed candidate with matching registered directory and canonical source in both registration fields and manifest. It never treats a historical installer as the current candidate.

Cases: wrong installer SHA-256, wrong target directory, and a live foreign executable PID. Each invokes the existing public apply contract with restart=true and requires the exact failed result step, unique operation identity, no application restart, unchanged application/Runner/manifest hashes and registration version/path, and the foreign process still running. Each Runner wait is bounded to 90 seconds. A timeout is recorded as FAIL and requires inspection rather than blindly terminating other processes. Only the fixture-owned foreign PowerShell is cleaned up.

PowerShell AST parse and git diff checks passed. No actual installed Runner case has executed for this source yet. This script does not establish application login/role/project/attachment authorization, actual Toolbox caller behavior, or successful apply update. Existing P1 acceptance remains scoped to its original artifact.

The historical Sandbox entry `.cache/p1-sandbox/p1.wsb` disables networking and maps only its old staging/evidence directories. It cannot prove HTTPS business security. A new isolated staging directory must contain only the final candidate and safe observation scripts; cos.txt and source-root mappings are prohibited.

## Isolated controller

`tests/windows/sandbox-runner-security.ps1` prepares a new repository `.cache` subdirectory and copies only the candidate setup, candidate SHA/version/source metadata, and the two safe guest scripts. It maps that input read-only and a separate evidence output; networking and clipboard redirection are disabled. The guest installs to a synthetic Unicode-safe isolated directory, checks manifest/registry/EXE versions, then runs the negative suite and writes installed-file hashes plus a scope-limited summary. The guest install remains until Sandbox closure; no host installation or production data is changed.

Invocation after freezing and building the candidate:

```powershell
./tests/windows/sandbox-runner-security.ps1 -Installer <absolute-current-setup-path> -SourceSha <exact-40-character-source-sha> -Version 0.1.4 -EvidenceRoot H:/Honsen/Honsen-Procure/.cache/installed-security-<unique-run>
```

Controller and guest scripts pass PowerShell AST parsing. Execution remains NOT RUN until the real candidate is available. A passing summary only covers installed Runner rejection; it cannot close the full application security gate.
