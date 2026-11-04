# Approved Toolbox launch scope2 — implementation and acceptance

Status: **implementation and affected builder checks complete; independent native/installed acceptance pending**. The controller assigns the containing implementation commit as the code checkpoint. This is not full Toolbox/V1 readiness.

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

Full Rust library142PASS/7native-or-HTTPS ignored preceded the final constructor correction; final affected Windows module5PASS/7ignored after that correction, Runner CLI4PASS, bins check/fmt/Clippy exit0. Style/test warnings are disclosed, not all historical. Ignored probes are not PASS. No frontend/server changes warrant repeating unrelated accepted business chains.

Detailed commands/failure history: TOOLBOX-LAUNCH-PARSER-PREFERENCES-20261104.md, TOOLBOX-LAUNCH-WINDOWS-MODULE-20261104.md and TOOLBOX-LAUNCH-ORCHESTRATION-20261104.md. Safe logs: ignored .cache/scope2-*.log. No credentials or signed redirect query is recorded.

## Remaining independent acceptance

- Actual USER32 buttons/locales/keyboard and explicit failure confirm/cancel, final compiled test binary/code checkpoint; DOM does not replace them.
- New installed candidate and exact setup/main/Runner hashes, source-failure cancel/continue and strict identity refusals in isolated Windows. Compare Runner with the actual pre-Tauri package resource, not a possibly rebuilt post-bundle binary. Reuse P1 only within its unchanged boundary.
- Qualified canonical stable asset for actual immediate-update download/apply; if absent mark BLOCKED_ENV, do not fabricate Release or substitute mocks.
- Actual Toolbox scope3 caller/catalog and original full V1 gates stay OPEN.
