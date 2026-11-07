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

The exact original migration 015 and protected-admin recovery implementation were restored from that delivery. New PostgreSQL migration 016 adds nullable display name and global case-fold uniqueness, stops transactionally on historical collisions, and forbids identity renaming. It does not impose an ASCII constraint on legacy records. SQLite migration 0063 adds nullable cached display name. UUIDs, password hashes, roles, grants, historical business records, outbox and Push/Pull payloads remain unchanged. Login display name is additive and optional for older server responses; old clients retain original-spelling login compatibility. Updated clients are needed for case-insensitive aliases.

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
