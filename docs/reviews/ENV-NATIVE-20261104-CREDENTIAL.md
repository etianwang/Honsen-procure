# Native credential environment evidence — 2026-11-04

Scope: isolated Windows credential probe only. No application, production, account credential or COS operation.

Command: `pwsh -NoProfile -File tests/native/invoke-windows-credential-readback.ps1 -Persist Enterprise -KeyringShape`

Result: exit 0, PASS. CredWrite, same-process CredRead and child-process CredRead each returned Success=true / Win32Error=0. All three synthetic blob SHA-256 values matched. Enterprise persistence=3, synthetic keyring-shaped user/target, 64-byte randomly generated test blob. Script finally deletes its uniquely generated credential; no cleanup error occurred.

The script was read before execution. Its Full action generates a fresh target and random data, does not enumerate or read existing credentials, and removes only that target. No source edits were necessary.

Acceptance boundary: this proves the current Windows session can round-trip synthetic credentials across processes. Historical credential_storage_error is not reproduced by this probe. It does not prove the application Rust keyring, online login, dual-client payment, COS, revoked-session behavior or installed runtime acceptance.

Next native-chain prerequisites: exact-source built HonsenProcure.exe and honsen-procure-test-profile.exe; built frontend; Node 24.18.0 and committed-lock dependencies; disposable PostgreSQL 16 on 127.0.0.1:54329; isolated .env.test; explicit authorized COS test configuration and random owned prefix; fresh resource/evidence root. Existing chain runner hardcodes Ubuntu/honsen-dev for self-managed Compose: current Ubuntu-24.04 requires deliberate adaptation or its ExistingDatabase mode with a prevalidated disposable container. Do not use a business database.

BLOCKER: complete dual-client native payment/COS acceptance remains unexecuted. DEFERRED: parent T09/T10/T11 completion, installation/update and release acceptance. WARNING: OS probe cannot substitute for actual Rust IPC evidence.
