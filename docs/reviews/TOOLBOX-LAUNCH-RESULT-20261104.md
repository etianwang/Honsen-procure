# Approved Toolbox launch scope2 — implementation and acceptance

Status: **scope2 implementation and bounded native/installed launch acceptance complete; actual upgrade FAIL and full Toolbox/V1 gates OPEN**. Tested production source is `90f28043aecd74a90d3267952b922aea45845a88`, pushed. A later evidence-only checkpoint is not the tested source.

## Authority and exact boundary

User explicitly approved TOOLBOX-LAUNCH-IMPLEMENTATION-20261104.md and its failure policy on2026-11-04. Selected work is bounded T15 launch implementation, not scope3. Controller and three real agents refreshed five upstream sources in order and compared integration gaps. Blobs: README2f133170, standard8f3a48d4, protocol4fdb16c0, integration0d885811, schema b2717e86.

Only private Rust launch implementation, existing windows-sys features, focused tests and task evidence change. Public CLI, Manifest identity/URL/fields, result protocol, NSIS/install/uninstall/data boundaries, business/shared/API and database migrations are unchanged. Strict launch reading is separate from existing apply validation. No main/PR merge, Release, catalog mutation or deployment.

## Implemented behavior

- Complete four-view registration, bounded UTF8/BOM Manifest, actual EXE version, canonical paths/reparse checks and current Runner identity before network. Revalidate and compare identity again before local spawn.
- Native WinHTTP HTTPS/system proxy, strict canonical stable/digest/size/asset parser and numeric version comparison. Async cancellation retains context/buffers until HANDLE_CLOSING; no certificate bypass or automatic redirects/authentication/cookies.
- Native zh/en/fr Update now/Remind later/Skip this version. Private atomic preference stores only exact skipped version. Broken preferences warn without permanently skipping; warning-dialog creation failure stops launch.
- Metadata/download/hash failure needs explicit confirmation before revalidating/local launch. Cancel does not start. Apply failure has no automatic local fallback, rollback or restart.
- Immediate update holds the verified file and uses the existing public apply CLI/temporary worker chain, with unique operation/result correlation, never a direct apply-function shortcut.

## Review corrections and checks

Cross-agent/controller reviews repaired unsupported synchronous cancellation before execution, template DWORD alignment, Chinese unknown-locale fallback, exact display-name validation, warning-error propagation and launch-only BOM support. A verified on-disk read handle and pinned directories now deny write/delete/rename through apply; contents are rehashed after writer close. A synthetic junction test actually demonstrated RED outside-installer.exe deletion during failed owner construction; GREEN now keeps that sentinel and cleans only its directory entry. No real business data was used. Ancestors stay pinned until owned directory removal.

Final exact90 Rust library143PASS/7ignored, Runner CLI4PASS, fmt and Clippy exit0. Logs: .cache/scope2-90f2804-final-{lib,cli,clippy}.log. Clippy style/test warnings remain disclosed. Seven opt-in functions were separately executed eight times against the immutable ab native probe binary; see the native report for exact unchanged-boundary reuse and the real90 installed Chinese recheck. No frontend/server changes warrant repeating unrelated accepted business chains.

Detailed commands/failure history: TOOLBOX-LAUNCH-PARSER-PREFERENCES-20261104.md, TOOLBOX-LAUNCH-WINDOWS-MODULE-20261104.md and TOOLBOX-LAUNCH-ORCHESTRATION-20261104.md. Safe logs: ignored .cache/scope2-*.log. No credentials or signed redirect query is recorded.

## Actual independent acceptance and remaining gates

- PASS: actual USER32 zh/en/fr choices, window close/Escape/Tab→Enter and explicit failure cancel/continue; precise probe source/binary and logs in TOOLBOX-LAUNCH-NATIVE-20261104.md/json. Update-now probe tests the returned selection, not a downloaded update.
- PASS: source90 local0.1.10 installed Runner matches effective package bytes; Chinese warning readable, actual offline Cancel exits0/main0, explicit Continue launches the registered real EXE/version0.1.10. Six actual invalid identity cases exit1/main0. No authentication/CAPTCHA input. WINDOWS-CANDIDATE-010-20261104.md/json records exact proofs.
- FAIL / BLOCKER: standard registered019 public apply to010 returns success while retaining old Runner. Main/Manifest/registry advance and synthetic SQLite/marker survive. Separate uninstall/reinstallation installs the expected Runner but does not repair or pass the upgrade. RUNNER-REPLACEMENT-P1-PLAN-20261104.md defines the paired limited fix; user approval is pending because scope2 excluded installer changes. No new NSIS implementation.
- BLOCKED_ENV: qualified canonical stable asset unavailable for live immediate-update download/apply. Actual network failure has no inferred404. No fabricated Release or substituted mock acceptance.
- DEFERRED: unapproved scope3 cross-repository Toolbox caller/catalog; full installed authentication/authorization/security, native/object backup restore, long-document/export/all-language and original final gates. These remain parent blockers, not this bounded local-launch PASS.

## Exact package and cleanup

Source90 candidate0.1.10: H:/Honsen/artifacts/windows/90f2804-010/Honsen-Procure-0.1.10-Setup.exe, SHA256 **4c69dbfaca53ea11e2da9d006b40fb126548358b05fd0b6c131a6c640d293890**. Effective last external Runner SHA256 **198093091d79159a62d01335b27dfe137bdd82b3f7e732faa34a27f065bff205**; the first duplicate resource is not the final expected payload. Artifact provenance is preserved beside the setup.

Final raw010-final-state.json confirms restored canonical registration/version, no HKCU fixture/junction alias/main process. Official wsb stop completed and list returned no environments. Only synthetic fixtures were used; no root/cos/env share. The earlier new-script/config batch rejected by automatic review was never executed or retried; these tests used the reviewed existing tracked Sandbox entry and official CLI in the owned guest. Original installation-directory P1 remains closed within its unchanged scope. No merge, Release or production deployment.
