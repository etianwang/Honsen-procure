# Isolated native demonstration harness

This standalone Cargo project is test code. It is not a member/dependency of the production package, has `publish = false` and `bundle.active = false`, and is never invoked by production build/release scripts. No production Rust, React, installer, account/session protocol or OS credential-store code is changed.

It reuses the RC core's existing `LocalAuthService::open_in_memory()`: real SQLite `:memory:`, the existing memory vault and all original Tauri commands. Password hashing, local CAPTCHA, cached-account window, trusted role/scope checks, transactional outbox, immutable approval/snapshots, receipt and append-only payment/reversal code remain active. Two named enabled fixture accounts use the existing test UUIDs; the third bootstrap account is disabled. No public registration or new authentication command exists.

The native executable requires `HONSEN_DEMO_TEST_ONLY=1` and a process-only random password of at least 24 characters. The launcher generates that password in memory, passes only an explicit environment allowlist, omits cloud API/database/COS settings, and uses an isolated WebView folder. Never point this harness at production; it cannot open a production SQLite file. Its database and credential cache disappear on exit. Media fixtures remain in their generated temporary test directories; preserve exported evidence before stopping.

## Build and reproduce

Use repository Node 24.18.0, `npm ci`, and the committed production lockfile. Build the unchanged frontend:

```powershell
npm run build --workspace @honsen/desktop
$env:CARGO_TARGET_DIR = Join-Path $env:HONSEN_DEMO_RUNTIME 'cargo-target'
cargo build --release --offline --locked --manifest-path tests/demo-native/Cargo.toml
cargo fmt --manifest-path tests/demo-native/Cargo.toml --check
```

Set `HONSEN_DEMO_RUNTIME` and `HONSEN_DEMO_OUTPUT` to fresh absolute isolated directories. The output directory must exist and must contain no prior smoke screenshot. Port 9368 must be free. Run the focused native DOM/security-boundary check:

```powershell
node tests/demo-native/smoke.cjs
```

The smoke test starts its own memory database, rejects unauthenticated reads, seeds legal fixtures, creates/submits a requisition through the actual React form, verifies Rust rejects purchaser self-approval, then uses the administrator's real login and approval controls. It asserts totals and actor audit IDs and retains console/page errors and an original PNG. It stops only its own process.

`session.cjs` also exposes the real-IPC and screenshot helpers used for the larger Bethel2 demonstration. All screenshot output is actual WebView2 content; it never injects authentication, DOM text or business-success responses. Typed business initialization uses original validated commands. File-import fixtures are explicitly labelled synthetic test evidence, not real photos or bank records.

## Evidence boundaries

The screenshots demonstrate an isolated native test build, **not the distributed Windows EXE**, OS credential storage, disk durability after restart, HTTPS/cloud authorization, COS upload, production security or release acceptance. No successful sync is claimed. The original RC header lacks account names and hardcodes the avatar; scrolled screenshots naturally omit its topbar. Supplier-child receipt counts require navigating away/back to refresh. No standalone per-batch receipt-history table was found.

The supplementary owner-issue fixture uses Rust's actual `material_price_id` input. The original UI adapter's camelCase field fails this boundary. Its saved final unit price is 1500 while detail still reports base unit1250/total12500. Preserve this as a separate confirmed gap; do not describe the formal-detail screenshot as correct pricing/PDF/print acceptance. The main Honsen procurement case remains 863000 XOF and is independently checked.
