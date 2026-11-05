# V1 final native security QA

Result: **PARTIAL / G1 BLOCKER**, not final security acceptance. Independently authorized host-native testing is distinct from the previously rejected Sandbox certificate/installation operation; that rejected operation and guest inventory were not retried or wrapped through another tool.

## Owning source and isolation

Build started at clean `f1420cbc3f2ad19afede1bf86bae5e82d96d1044`; subsequent checkpoint changes were documentation only. Build log `.cache/v1-final-qa-native-build.log` exits0. Real debug test-profile EXE `.cache/cargo-target/debug/HonsenProcure.exe` SHA-256 `74774bfe641c851a5762fc7b6f39f8b7f6771f88b9b040e5a1d8c9d99c160769`. Identical Rust bytes to an earlier candidate are not installed013 provenance. The real EXEs used independently seeded `.test.sqlite` profiles, production Tauri IPC, local/cloud CAPTCHA and real HTTPS against fresh disposable PostgreSQL16, not direct renderer/SQLite business writes.

The original tracked G1 driver still assumes pendingCount1 after stale Push; current authoritative conflict replies immediately project the conflict and supersede the original unacknowledged outbox event. A private `.cache/host-native-qa/g1-current.mjs` copy requires pendingCount exactly0 and adds strict read-only SQL checks: exactly one owned original event/conflict, matching entity/event join, acknowledged_atNULL, superseded_at nonNULL, original payload identical to local conflict payload, and both expected local/server source strings retained. Existing role/account/session recovery expectations were preserved. The wrapper is isolated under `.cache/host-native-qa/run.ps1`; no business source or tracked test was changed.

## Three actual attempts, then stop

1. `native-smoke-20261105084325`: FAIL before business; private wrapper's process working directory made its profile-root guard reject. The guard was retained and root resolution corrected to the driver-relative project root.
2. `native-smoke-20261105084631`: FAIL before business; current login page rendered real account/password/CAPTCHA controls but the old button-role readiness selector did not match. Private readiness changed to visible actual `#account`, without changing login or permission checks.
3. `native-smoke-20261105085028`: FAIL after real backend/native activity. Trusted producer material Push succeeded; purchaser stale Push returned immediate conflict; strict original-event/owner/dual-payload SQL checks passed; authorized conflict list contains exactly one matching local/server source. The subsequent existing UI login helper reached `sync_status` with `reauthentication_required`, failing before the deliberate revoked-session/401 recovery section. No revoked-session acceptance is claimed, no cause such as data leakage is inferred, and no expected denial was relaxed to force a green result.

Raw JSON is `.honsen-native-qa/<run>.test.json`; logs are `test-results/<run>-client.log` and archived real sync diagnostics `<run>-server-sync.test.jsonl`. These actual FAIL results remain unchanged. After three attempts, work on this driver stopped rather than continuing fixture repairs. The original retained conflict records are recovery evidence, not final security PASS.

## Cleanup and remaining gates

Owned Compose `honsen-final-native-security` was removed with repository compose.test.yaml and down --volumes; its container/network removal was observed. The dedicated normal-user WSL holder was interrupted only after cleanup. No listeners remained on1420/3443/54329/9241/9242; these ports were explicitly handed to the recovery agent. No production data, COS object, host install, user Sandbox, security policy or certificate trust was touched by this host slice.

BLOCKER: G1 real revoked-session lock/known-ID denial/online recovery and complete security parent acceptance remain unaccepted at this source. Safe next step is independent diagnosis of the exact third-run UI/session boundary with preserved profiles and API evidence, before another bounded repair. DEFERRED: installed-release online security and full historical role matrix; historical scoped payment/COS/HPA/SPO/printing evidence remains bound to its original source and is not rerun or transferred here. WARNING: passing direct IPC/CAPTCHA/conflict-retention assertions in a debug host test does not establish installed013 acceptance or close any Formal hold.
