# SPO offline native sub-slice — 2026-11-04

Result: **PASS for offline native issue and pending retention only**. Full SPO HTTPS/PostgreSQL/same-order cross-client acceptance remains BLOCKED_ENV on prescribed54329. There is no network-transport-failure/retry PASS here.

## Exact artifact boundary

- Application source: `db2ad11988050583ae70b76c834b7eb8cbb1985d`.
- Debug HonsenProcure.exe SHA-256: `fde98259b5b31c2ffab97b40a104ffa6f3ef24490a172a80973feb956221d190`; both copied client EXEs match.
- Debug test-profile helper SHA-256: `a5914e95983b7bea9be5ce9c287d86805b7a074909fc612415c1dd1ad2e9ccd6`.
- Compiled frontend was copied before later editing to `.cache/offline-spo-f91d5f9b-89a2-430c-8424-476c96c9faa4/frontend` and served with Vite **preview**, not mutable application source.
- Raw scoped result: `.honsen-native-qa/native-smoke-20261104072743-offline.test.json`; safe command outcome records contain no passwords or arguments. Run log: `.cache/spo-offline-second.log`; build: `.cache/spo-offline-build.log`.

The raw report truthfully records dirty files from concurrent later frontend work and these new harness files. Those files are not the built EXE/frontend boundary above. Harness/evidence commits do not become a tested application source SHA. Release debugging was not enabled; the existing debug-only test-profile/port guard was retained.

## Actually executed

Existing `honsen-procure-test-profile seed` created two fresh `.test.sqlite` profiles using randomly generated process-local passwords and supported synthetic cached account/authorization fixtures. No business rows were inserted or copied by the harness. Each real Windows EXE separately executed production IPC: engineer offline login with local CAPTCHA → save draft → select Honsen mode → submit → lock → distinct purchaser offline login → confirm → supplier maintenance → child allocation → saved terms → send SPO. SQLite reads were read-only evidence queries.

Installations were `b9fd4e29-da1c-40d4-8dd6-2afdfebd2647` and `3b3034c9-d025-4d17-b5ce-f98e77f02d7a`. Both child drafts initially had no formal number. Sending produced sent state, persistent SPO number and frozen snapshot. The two independent installation namespaces produced different numbers; each profile retained9 unacknowledged events. Push was rejected and did not remove pending events or change the issued number.

**Precise Push boundary:** both actual errors were `reauthentication_required`, because the supported offline seed provides cached offline identity/authorization but no live cloud session token. Therefore this test did not reach a TCP/HTTPS server. It proves offline issue and refusal to falsely acknowledge unauthenticated Push; it does not prove unreachable-service transport, authenticated retries, server rollback/idempotence or cross-client convergence. Both clients issued separate synthetic orders; they did not exchange the same order. The initial sub-slice left the renderer logged out during explicit IPC; the later ordinary-UI preview run below adds only its stated UI evidence.

## Commands and retained failure

```powershell
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --bin HonsenProcure --bin honsen-procure-test-profile
& tests/native/run-spo-offline.ps1 `
  -NativeExe H:\Honsen\Honsen-Procure\.cache\cargo-target\debug\HonsenProcure.exe `
  -ProfileExe H:\Honsen\Honsen-Procure\.cache\cargo-target\debug\honsen-procure-test-profile.exe `
  -FrontendSnapshot H:\Honsen\Honsen-Procure\.cache\offline-spo-f91d5f9b-89a2-430c-8424-476c96c9faa4\frontend `
  -SourceSha db2ad11988050583ae70b76c834b7eb8cbb1985d
```

The first real attempt reached approval, then correctly rejected changing a seeded supplier's immutable business code (`immutable_business_code`). The fixture now reads and preserves its existing synthetic code; no product guard changed. The first failure remains `.cache/spo-offline-first.log` and `.honsen-native-qa/native-smoke-20261104072619-offline.test.json`. The second complete run PASS for the scoped assertions above. Native JS syntax, PowerShell parse and diff checks PASS.

Owned EXEs and preview server were terminated; final1420/9241/9242 listener and HonsenProcure process check returned none. Synthetic profiles/snapshot/evidence were retained. No PostgreSQL container, production service, COS object or credential, user process, manifest, installation or Release was modified. No business database writes occurred outside supported isolated test profiles. The supported cached-only fixture cannot satisfy authenticated transport prerequisites: continue the existing full native SPO runner once its isolated PostgreSQL port is available, instead of fabricating an online token or bypassing authentication.

## Same-artifact native formal preview

Final extension raw result: `.honsen-native-qa/native-smoke-20261104073332-offline.test.json`, PASS with the same db2ad11 EXE hashes and compiled frontend snapshot. Both clients issue independent synthetic SPOs, invoke the actual trusted get_formal_print_document command, and verify issued number, documentTypeSPO, two frozen Chinese/French lines and total200XOF. Each then locks, signs in through the ordinary native offline login form/CAPTCHA, navigates procurement execution → parent → supplier child, clicks the existing nested formal-preview control, and verifies the rendered number, exact frozen French name and200XOF total. Screenshots are the raw-result path suffixed `-device-0-preview.png` and `-device-1-preview.png`. The second screenshot was visually inspected: bilingual line names/specification and two100XOF lines, total200XOF and a nonzero offline-pending badge are visible. No print dialog, PDF output, physical printer, server acknowledgment or cross-client convergence is claimed.

The first UI attempt correctly rendered the trusted catalog material name Câble synthétique rather than the caller-provided fixture name Synthétique figé. The old expectation failed; it now checks the exact trusted frozen print payload rather than expecting the renderer's requested catalog override. Failure retained in `.cache/spo-offline-preview.log` and raw run073244; final output in `.cache/spo-offline-preview-final.log`. An earlier incomplete source search wrongly concluded the child preview entry was absent; independent review found it nested in SupplierChildTermsPanel. That conclusion was withdrawn and no duplicate production control was added.

## Provenance guard added after the recorded business runs

Independent review found the first runner accepted `-SourceSha` but the driver only recorded Git HEAD. The runner and driver now both reject when the declared full application SHA differs from current HEAD, before starting native work; the driver separately records `harnessHead`, actual source EXE and profile-helper hashes, and a deterministic sorted filename/SHA-256 manifest of the fixed frontend tree. This is a provenance reporting guard, not a product change. Corresponding-source artifacts must still be built and captured deliberately: matching Git HEAD cannot prove the compilation provenance of an arbitrary supplied EXE.

The matching-source guard unit test PASS1/1 covers a matching full SHA, mismatched HEAD, absent SHA and shortened SHA rejection. Node syntax, PowerShell parse and diff checks PASS. No business rerun was performed for this reporting-only correction, and the historical raw results were not rewritten to claim newly recorded fields. Their recorded HEAD actually was db2ad11 and matched the declared source. A read-only manifest calculation of the retained six-file frontend snapshot produced `ed6e53de9e12af5b2baaac72d51e8b65d59b23ee5d96de145bebe1b013150425` (SHA-256 of the sorted JSON filename/file-hash list), independently of later source edits.
