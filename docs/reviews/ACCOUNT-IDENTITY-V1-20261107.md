# V1 account identity and provisioning — 2026-11-07

Status: local implementation and compatibility verification; remote acceptance BLOCKED.

Selected scope: existing T02/T04/T10 account workflow, class B confirmed identity and provisioning defects. New usernames accept ASCII letters and digits only, preserve spelling, and have a globally unique ASCII case-folded server index. Unicode display names are separate. Existing Unicode login identities remain valid and no account is renamed or reset. The permanent `admin` protection is retained.

Target accounts, to be created through authenticated administrator workflow after deployment:

| Login      | Display name | Roles                    | Scope                                                    |
| ---------- | ------------ | ------------------------ | -------------------------------------------------------- |
| Zhanghekai | 张和凯       | administrator, purchaser | CI / Bethel2办公楼 and selected existing department/team |
| ceshi1     | 测试1        | engineer                 | Same explicitly selected test scope                      |

No password belongs in this report or in release assets. Existing accounts must be looked up before creation; no duplicate creation or password reset is authorized.

## Compatibility boundary

The locally delivered baseline ZIP is `honsen-procure-server-v1-0829780499a9b0ffe4bc490a9d4530e0416a24cb.zip`, SHA-256 `c9233b3e5a9a7222dd53cbab831877af2352ca264a1569e32091a59ee0018f12`. This identifies candidate deployment evidence, not the unobserved running server SHA.

The exact original migration 015 and protected-admin recovery implementation were restored from that delivery. New PostgreSQL migration 016 adds nullable display name and global case-fold uniqueness, stops transactionally on historical collisions, and forbids identity renaming. It does not impose an ASCII constraint on legacy records. SQLite migration 0063 adds nullable cached display name. UUIDs, password hashes, roles, grants, historical business records, outbox and Push/Pull payloads remain unchanged. Login display name is additive and optional for older server responses; old clients retain original-spelling login compatibility. Updated clients are needed for case-insensitive aliases and account creation with the required separate displayName. Older account-creation requests without that field receive validation failure; older business sync and original-spelling login remain compatible.

An actual upgrade using every raw SQL/checksum from the delivered ZIP passes both the successful legacy/admin-preservation scenario and collision rollback scenario. A local stray CR in migration 014 was restored to its unchanged Git/ZIP bytes; no deployed checksum ledger or historical migration was rewritten.

Trusted desktop caching fails closed across OS credential-store and SQLite failures: invalidate the target cached authorization and local session durably before updating its verifier, then activate the new profile only after successful completion. This is not a cross-store atomicity claim. Failed updates require a fresh online login; business data and outbox remain intact. Known identity collisions are rejected before either store changes.

## Evidence

| Check                                      | Result and exact scope                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Fresh PostgreSQL full server suite         | 232 PASS, 3 opt-in live-COS SKIP; server typecheck/lint/build PASS                                              |
| Delivered ZIP SQL upgrade                  | 2 PASS; isolated PostgreSQL only, not remote deployment                                                         |
| Shared typecheck/lint/unit/build           | PASS; 29 unit tests                                                                                             |
| Independent desktop identity/failure tests | 10 PASS, including SQL statement failure, COMMIT failure and verifier-write-then-error                          |
| Account wizard renderer proof              | 22 PASS including three-language legacy login and profile/header fallback; IPC mocks, not real account creation |

Final desktop gates: `cargo test --lib` 177 PASS / 7 existing opt-in native/dialog/network tests ignored; `cargo fmt --all -- --check` and `cargo clippy --all-targets` PASS with existing warnings. Desktop typecheck/lint/unit/build PASS (30 unit tests); final account/login DOM 22 PASS. Packaged runtime commands and artifact identities are appended after the pinned source build. Earlier failures remain recorded in local logs and are not relabelled PASS. Independent migration/cache results do not close installed, native multi-client, COS or Alpha gates.

## Deployment and remaining acceptance

The public account-management 404 remains a deployment blocker until the tested candidate is deployed through the existing Baota operator workflow. Do not expose recovery as an HTTP endpoint, bypass administrator authorization, write remote business tables, rerun bootstrap seed, rename legacy users, or reset the existing admin.

BLOCKER: controlled deployment of the tested server candidate; actual administrator UI login; remote account existence/create and exact role/scope readback; both target logins and remote independent-client Push/Pull; original financial, immutable snapshot, permission revocation and installed data-retention gates. No remote account creation or native two-client PASS is claimed here.

DEFERRED: conditional Windows Alpha installer and prerelease after required gates; original Formal/security/Toolbox release holds. WARNING: existing frontend effect warnings and opt-in/ignored tests are not new acceptance evidence.

Decision: `ALPHA_INTERNAL_TEST_BLOCKED`. This bounded identity repair does not constitute production release approval.

## Pinned source and deployment-check correction

Implementation checkpoint `bb6f49ea5c7d32d6beca167b7e1f5efe34c029da` was pushed to `codex/account-identity-20261107`. CI run42355482380 passed formatting, lint, typecheck, unit/PostgreSQL tests, production build and14 release tests, then failed the deployment-grant check because the restored015/new016 routines were absent from the reviewed grant policy. This is a real failed candidate, not a passing deployment artifact. The correction restores the delivered015 routine verification and registers016 with exact function body/trigger bindings and zero runtime EXECUTE grants. No migration bytes or broad runtime privileges change. Focused deployment verification and replacement artifact identity follow below.

Windows standalone diagnostic built from the same application source: `.cache/remote-alpha-account-identity/HonsenProcure.exe`, SHA-256 `e21fc7240d8ef876ae867765040ce7fbe71783ef9cf08e1b12e81f49f5fe24ec`. It was not launched or installed, and is not a Windows Alpha installer. No old executable or user data was overwritten. Offline-error wording can still be generic after a failed cache refresh; the authorization denial itself is tested and preserved.
Deployment-grant correction independently passes the actual PostgreSQL deployment check (`TMPDIR=… TEST_DATABASE_URL=… node tests/deploy/test-t04-grants.cjs`): restricted-role Push/Pull/repair and deployment trigger checks PASS. Four protection routines have no API EXECUTE privilege; a permitted column UPDATE still cannot rename an account. Formatting and JavaScript syntax checks PASS. Original failed CI remains linked above. No migration or desktop production change followed the original checkpoint.

## Final candidate 569fac8

Server/package source: `569fac83ceb3f8f44446c34a2640b4e812dc689b`. Desktop application source is unchanged from `bb6f49ea5c7d32d6beca167b7e1f5efe34c029da`; the later commit changes deployment verification/tests and this ledger only.

ZIP: `.cache/server-release/honsen-procure-server-v1-569fac83ceb3f8f44446c34a2640b4e812dc689b.zip`, 3,544,995 bytes. SHA-256: `faeeeb3402e7ada51cbf265f039f6ef327e8e7e01b2f18e326d6ba8e5f69a4b0`.

The actual ZIP was extracted into a dedicated test directory, every internal SHA256SUMS entry verified, then run with Node24.22.1, PostgreSQL and a restricted runtime role through local HTTPS with certificate verification enabled. PASS: migrations through016; uppercase ADMIN resolves to unchanged admin; normal authenticated API creates Zhanghekai/张和凯 with administrator+purchaser and ceshi1/测试1 with engineer; upper/lower login returns the same UUID, correct display name and roles; mandatory first password change revokes old token; self authorization context returns exact selected Bethel2/department/team; engineer cannot manage accounts/grants or write supplier; purchaser supplier Push is read by engineer Pull through real PostgreSQL. Passwords were random and runtime-only in the disposable test, not the user's intended remote initial password. Manifest SHA/latest migration/API match; forbidden environment/credential files absent. Log: `.cache/identity-c-package-final.log`.

This is isolated packaged-runtime/API two-account proof. It is NOT Staging account creation and NOT two independent native SQLite clients. Earlier smoke403 was a wrong test endpoint: engineer correctly cannot use the administrator bindings-query endpoint; the corrected self-context endpoint passes. No production authorization rule was relaxed.

Fresh public read-only probes: CAPTCHA200; account lookup404. Running server source remains UNKNOWN. Server redeployment is required for this identity/provisioning change. Existing `.env` and PostgreSQL must be preserved, backed up and upgraded through the normal owner migration workflow; do not repeat bootstrap or use recovery to reset admin. Deployment requires explicit operator approval under AGENTS.md. Alpha remains blocked until actual remote accounts, permissions, native multi-client and installer/data-retention gates pass.

Owned verification cleanup: packaged-runtime container exited0 and was removed; dedicated Compose database project was removed with down --volumes exit0; keeper stopped; exact test-only TLS key/certificate files deleted; ports3000/3443 have no test listeners. No unrelated containers, user certificates, local business data or remote data were deleted. Candidate CI42356021083 passed corrected deployment grants, Linux ingress/controller integration and the traceable Linux build, then finished renderer tests with106PASS/4FAIL. The failures reference previous conflict-label, UUID-input and generic-login-error expectations; they remain failures until current behavior and equivalent assertions are independently checked. No overall CI PASS is inferred.

Final renderer correction is test-only: two conflict tests verify the translated business label AND expand raw material/upsert details; the authorization test uses username lookup and named selectors, retaining atomic old-to-new binding replacement and exact revoke payload; failed credential login verifies the specific error and no Push/Pull/authorization-refresh. Builder focused4PASS, independent3+1PASS, final isolated local full renderer110PASS (2.5m, default timeouts, two workers). Initial independent concurrent click timeout remains a WARNING: a single-case default-timeout repeat passed1.2s without source changes; its root cause is not fully established. Formatter/diff checks PASS. No production/source/artifact change follows package569fac8, so existing exact server/Rust/package evidence is reused only across that unchanged boundary. The corrected test/records commit receives fresh quality CI; preceding106PASS4FAIL is not retroactively relabelled.

Final independent cloud quality: commit `e669201a5fb57b0203edbe0789b0a5a6ddf4b6b2`, GitHub run [42357505884](https://github.com/etianwang/Honsen-procure/actions/runs/42357505884), overall SUCCESS. Formatting/lint/typecheck/unit/PostgreSQL/build/release checks, restricted deployment grants, Linux nginx/systemd/controller integration, traceable Linux artifact build and full renderer regression all passed. This supersedes neither earlier failures nor remote acceptance: they remain recorded. Subsequent handoff edits are documentation only; application/deployment/test source remains identical to this green checkpoint, and package569fac8 retains its exact pinned artifact identity.
