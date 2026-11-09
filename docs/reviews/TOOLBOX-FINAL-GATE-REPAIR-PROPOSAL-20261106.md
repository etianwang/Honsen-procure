# Toolbox final-gate minimal repair proposal — 2026-11-06

Status: reviewable proposal only. No conflicting implementation, registry, public Manifest, catalog or update source has been modified. These two approval items are independent; approving existing-protocol caller repair does not implicitly approve a new test update channel.

## Verified owning sources

Upstream `etianwang/Honsen-toolbox/main` was read live through the GitHub connector. `git ls-remote` identifies commit `f4a83c5848fa4bcab16e34c683b0423dd5cb6051`. [MainWindow.xaml.cs](https://github.com/etianwang/Honsen-toolbox/blob/f4a83c5848fa4bcab16e34c683b0423dd5cb6051/MainWindow.xaml.cs) has Git blob `429a0eefc2780d2cb4c5d8f58cf1bf14cc53bc92`.

- Lines 479–503: `LaunchConnectedToolAsync` invokes `launch`, then appends `--wait-pid`, `--operation-id`, `--result-path` and expects an update-result file. Those extra parameters/result expectation do not belong to the frozen `launch` contract.
- Lines 505–542: connected-app update check compares `tag_name`; it does not perform third-party Runner `apply`.
- Lines 544–580: `InstallKnownToolAsync` handles only CAD/document-translator first installs and directly uses their Inno parameters. It is not a Procure update/apply path and must not be repurposed to launch the NSIS installer directly.
- Lines 627–634: `HONSEN_PROGRAM_ROOT` changes only the product-root directory. It is not an update-source/test-channel override.
- The current catalog does not register Procure. The [integration contract](https://github.com/etianwang/Honsen-toolbox/blob/f4a83c5848fa4bcab16e34c683b0423dd5cb6051/docs/toolbox-integration-contract.md) explicitly forbids enabling Procure catalog/auto-install before prerequisites and end-to-end acceptance.
- The Procure canonical stable checker actually returned HTTP 404 during this attempt. That is not successful update discovery.

The five required upstream documents were read again in the specified order and compared with `docs/HONSEN_TOOLBOX_INTEGRATION.md`. These are confirmed implementation/acceptance gaps, not a reason to alter the fixed identity or publish an unqualified stable release.

## Approval item A: implement the existing caller contract in the Toolbox repository

This is missing functionality and repair of a caller mismatch against the already approved public protocol. It does not require new Procure public arguments, Manifest fields or result fields.

Requested bounded changes in the Toolbox repository:

1. Make `LaunchConnectedToolAsync` send only `launch --app-id <registered appId> --source toolbox`. Remove the apply-only arguments and the expectation that launch writes an apply-result JSON. Keep errors visible; do not fabricate a successful update result.
2. Add the missing connected-application update action using the existing contract: read verified registration/Manifest, obtain the canonical stable release, reject draft/prerelease/malformed or ambiguous assets, select the exact versioned Procure Setup asset from the approved repository, require its digest, download over verified HTTPS and independently check SHA-256.
3. Invoke the registered `HonsenUpdateRunner.exe apply` with the existing fixed parameters. Use a fresh GUID and unique result path per operation, exact registered target directory, verified application PID or zero, and `--restart false` for the Toolbox update action. The Toolbox must not directly launch NSIS or replace application files.
4. Accept only the result for that exact operation/app/source/target version. Missing, stale, mismatched or failed results remain failure. Verify updated identity/version/installation directory before displaying success. A later explicit Open action uses Runner `launch` again.
5. Add focused caller tests for exact launch arguments, stable-release/asset/digest rejection, download corruption, correct apply invocation, stale/mismatched/missing result rejection, failed installer/UAC result handling, and post-install version/path mismatch. Then run the real isolated native caller→Runner→NSIS chain when its environment and source prerequisites exist.

Unchanged: `honsen.procure`, Tauri identifier, product directory, EXE name, registry paths, canonical stored UpdateManifestUrl, public Manifest schema, Runner arguments and result JSON, NSIS directory/ownership/uninstall boundaries. No installation-directory P1 redevelopment. No automatic catalog eligibility or stable publication.

## Approval item B: a separately gated development-only integration update channel

There is no existing supported test update channel in the inspected owner. The current task's permission to use an existing channel therefore does not authorize silently inventing a canonical-URL override.

Requested narrowly bounded development facility:

- A separate Toolbox integration-test build configuration can accept an explicit HTTPS fixture-release endpoint and its test asset source. It must be visibly labelled as an integration build, opt-in per run, and unavailable/rejected in the normal production build.
- The fixture uses the same release/asset/digest shape and the same download/hash/Runner/result processing as item A. TLS certificate checks, asset integrity, process/target checks and all Runner safety checks remain mandatory. No host or guest CA trust is installed without an allowed isolated-environment operation; no policy rejection is bypassed.
- The isolated installed Procure Manifest/registration retain the canonical production URL. The test selector exists only in the Toolbox integration build; it is never persisted as a new Procure public Manifest/registry field and never becomes a production canonical override.
- Test evidence must say “development integration channel”, identify caller/installer source and hashes plus the HTTPS fixture owner, and cannot count as successful GitHub stable availability. No stable Release, catalog entry or production asset is created to remove a 404.
- Add explicit production-build rejection tests, absent-opt-in refusal, TLS/asset/hash failures and artifact-identification assertions. Keep the test configuration/documentation in the Toolbox repository and exclude its fixtures/credentials from stable packaging.

This introduces a development trust/source selector that the current protocol does not specify. It requires explicit owner approval and a documented development exception in the owning Toolbox testing instructions before implementation. It does not propose changing public Procure Runner/Manifest/result schemas. If an owner requires a public protocol amendment instead, stop and obtain that separate approval rather than extending item A implicitly.

## Independent environment prerequisites, not solved by either code approval

The retained Sandbox guest `283a80d3-ca0e-4799-963f-8d2a9eaa74d5` last encountered `CreateProcess blocked by policy` on guest installation evidence collection. The same rejected operation is not retried or moved onto the host. A current read-only `wsb list` still returns its ID, while the Computer Use window inventory exposes no targetable Sandbox or Toolbox window; listing an ID is not a successful guest execution.

Host read-only UAC policy is `EnableLUA=1`, `ConsentPromptBehaviorAdmin=0`, `PromptOnSecureDesktop=0`; no real UAC prompt was produced by this attempt. Historical guest wizard cancellation is not UAC cancellation. True cancel acceptance remains `BLOCKED_ENV`; policy/user/account changes are outside this proposal.

Authenticated 0.1.12→0.1.13 business-data retention likewise needs an executable isolated installed environment. Historical initialized-empty-database retention must not be promoted to authenticated business/history PASS. Caller repair or a new build alone does not close these environmental gates.
