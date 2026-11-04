# Integration Agent A evidence — 2026-11-04

Candidate: 39b3d65d1e2af2437a133d614014817664017393. Unique source root: H:/Honsen/Honsen-Procure.

Sequential Rust commands with CARGO_TARGET_DIR set to repository .cache/cargo-target:

- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib hpa_: PASS, exit 0, 2 passed / 0 failed (121 filtered). Complete frozen Honsen snapshot Pull/receiving and authorized atomic HPA issue with existing children.
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib payment_conflict: PASS, exit 0, 3 passed / 0 failed (120 filtered). Additive immutable migration; competing reversal, owned retry and two-file SQLite effective ledger; other-creator queue, pending/restart, role/scope and rollback.

First command downloaded locked Rust dependencies from the configured rsproxy registry and compiled successfully. Tests were run sequentially; no parallel Cargo invocation was initiated by this agent.

COS configuration check enumerated only names of matching current-process environment variables; none matched COS_REGION, COS_BUCKET, COS_SECRET_ID, COS_SECRET_KEY, HONSEN_TEST_COS_PREFIX, COS_ENV_FILE or the checked native-variable pattern. No values or private files were inspected. No explicit authorized CosEnvFile was supplied.

BLOCKER: installed dual-Windows payment/COS and revoked-session acceptance NOT RUN: existing native server requires authorized COS configuration, and no explicit test configuration source was supplied. No production service was used. Rust two-file SQLite tests do not replace native EXE/IPC/HTTPS/COS acceptance.

DEFERRED: HPA native multi-client acceptance remains NOT RUN; existing runner lacks an HPA scenario, so building an executable alone cannot satisfy that boundary. Full original T09/T10/T11 and release gates stay open.

Compatibility audit: payment ca44150 is already integrated as RC 0d0c80d. At d58d509, direct content comparison of payment Rust/expenditure/attachments, SQLite0059, PG013, shared sync contracts, server sync/API/native fixture, conflict UI, grant policy and payment/native tests against origin/codex/procurement-t09a was identical. Do not replay the payment implementation or replace RC files with older branch copies; preserve later quote-identity and update-runner changes.

## Full-suite fixture repair

Controller full Rust run at 39b3d65: 122 passed, one failed in reference_sync_postgres_history_replays_after_restart, SQLite FK787. Focused rerun reproduced the failure. The seed helper now creates UUID 00000000-0000-4000-8000-000000000006 but this old test selected mig-order, inserting no parent. Test-only repair selects the existing seeded UUID and asserts exactly one frozen parent inserted; foreign keys and replay assertions remain enabled. No application logic changed. Fixed focused test 1/1 and complete cargo test --lib 123/123 passed; cargo fmt applied. Final checkpoint contains this test-only repair plus evidence, with application behavior unchanged from 39b3d65.
