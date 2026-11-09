# Installed Runner security — 2026-11-04

Status: PASS for the bounded installed Runner negative checks below; complete application security remains OPEN.

The new `tests/windows/installed-runner-security.ps1` runs only as Windows Sandbox's WDAGUtilityAccount. It requires a previously installed candidate with matching registered directory and canonical source in both registration fields and manifest. It never treats a historical installer as the current candidate.

Cases: wrong installer SHA-256, wrong target directory, and a live foreign executable PID. Each invokes the existing public apply contract with restart=true and requires the exact failed result step, unique operation identity, no application restart, unchanged application/Runner/manifest hashes and registration version/path, and the foreign process still running. Each Runner wait is bounded to 90 seconds. A timeout is recorded as FAIL and requires inspection rather than blindly terminating other processes. Only the fixture-owned foreign PowerShell is cleaned up.

PowerShell AST parse and git diff checks passed. This preparation statement predates the actual installed run appended below. This script does not establish application login/role/project/attachment authorization, actual Toolbox caller behavior, or successful apply update. Existing P1 acceptance remains scoped to its original artifact.

The historical Sandbox entry `.cache/p1-sandbox/p1.wsb` disables networking and maps only its old staging/evidence directories. It cannot prove HTTPS business security. A new isolated staging directory must contain only the final candidate and safe observation scripts; cos.txt and source-root mappings are prohibited.

## Isolated controller

`tests/windows/sandbox-runner-security.ps1` prepares a new repository `.cache` subdirectory and copies only the candidate setup, candidate SHA/version/source metadata, and the two safe guest scripts. It maps that input read-only and a separate evidence output; networking and clipboard redirection are disabled. The guest installs to a synthetic Unicode-safe isolated directory, checks manifest/registry/EXE versions, then runs the negative suite and writes installed-file hashes plus a scope-limited summary. The guest install remains until Sandbox closure; no host installation or production data is changed.

Invocation after freezing and building the candidate:

```powershell
./tests/windows/sandbox-runner-security.ps1 -Installer <absolute-current-setup-path> -SourceSha <exact-40-character-source-sha> -Version 0.1.4 -EvidenceRoot H:/Honsen/Honsen-Procure/.cache/installed-security-<unique-run>
```

Controller and guest scripts pass PowerShell AST parsing. The initial NOT RUN state is superseded only by the bounded actual result below. A passing summary only covers installed Runner rejection; it cannot close the full application security gate.

## Actual installed candidate result

Bounded gate: PASS, 2026-11-04. Source `2812631593cfec5a06375567ae6fe50aee049c4f`; local version `0.1.4`. Production build-input diff against that source was empty before/after build. Worktree was not clean: unrelated evidence/navigation tests were dirty; they were not build inputs.

Installer: `.cache/cargo-target/release/bundle/nsis/Honsen-Procure-0.1.4-Setup.exe`; SHA-256 `70671eb69e832b0e8dba5cb536fae1004557572996c461fcc9e685becf634e1b`. Build exit 0; log `.cache/setup-014-build-20261104.log`.

Fresh Windows Sandbox OS `10.0.26100.0` installed this candidate. Registry, manifest and EXE version matched. Both registered update URLs and manifest canonical URL passed exact preconditions. Actual bad-hash, wrong-target and foreign-live-PID cases each returned exit 1 at the precise expected step: `hash-validation`, `identity-validation`, `wait-process`. Each result JSON used its own operation ID; no client restarted, installed file hashes/version/path were unchanged, foreign process survived all checks and was then cleaned up by its owner.

Raw evidence: `.cache/installed-security-014-20261104/evidence/{summary.json,runner-negative.json}`. Safe structured copy is the adjacent `INSTALLED-RUNNER-SECURITY-20261104.json`. Installed EXE SHA-256: `1eaa02eee86b89fd3d9b532543f8019f6c020f047f26a31f157fb9a647eb2654`. Installed Runner SHA-256: `af4e7dc5e9a4907d9140147234431b9da4b25d223aa582e96c25dd2630c6ba22`.

The task-owned Sandbox session was closed after evidence capture, disposing its synthetic installation. No host production installation or COS data was touched. Existing P1 proof was not rerun. Full installed business/security, actual Toolbox launch/apply caller, successful version upgrade, PDF virtual/physical printing and restoration remain OPEN; none inherit this limited PASS.
