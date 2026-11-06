# Baota PM2 README package rehearsal — 2026-11-06

Artifact source: `1ec5ab5ebe72135a2f7fad9550d374166dd4e5b0` on `codex/v1-resume-20261104`.

ZIP: `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-1ec5ab5ebe72135a2f7fad9550d374166dd4e5b0.zip`.

Size: 3,531,378 bytes. SHA-256: `0b65b95bb9e523cef6f17819c92d453cebbf4b0a201ab1598beb1a0ab1ae5980`.

## Actual acceptance boundary

Fresh isolated Ubuntu 24.04.5, Node 24.22.1, PostgreSQL 16.15 with pgcrypto extension files physically absent. Real Baota stable panel installed in a disposable container; real PM2 model invoked through its backend, not a substitute application launcher. Browser GUI clicks were not exercised. No SSH, production database writes, stable Release or main merge.

| README step | Evidence/result                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1           | Actual ZIP extracted; archive SHA and packaged SHA256SUMS checked. PASS.                                                                                                         |
| 2           | Actual psql path; existing ordinary maintenance/API roles; encoded passwords containing reserved characters. PASS. Conditional new-role creation was not needed.                 |
| 3           | All 17 migrations applied using maintenance owner, without pgcrypto. PASS.                                                                                                       |
| 4           | Interactive Seed: admin, CI/CM, three approved projects, 14 units, country VAT 1800/1925 basis points; project defaults. Actual admin login and pull of 24 seeded records. PASS. |
| 5           | Maintenance grants applied; honsen_api login and DDL refusal SQLSTATE42501. PASS.                                                                                                |
| 6           | Actual .env variables populated interactively, restricted permissions and API role verified. PASS.                                                                               |
| 7           | Actual Baota PM2 backend, start.mjs, empty arguments, one fork, Node24.22.1, unchanged bundled node_modules. PASS.                                                               |
| 8           | Actual listener, process executable/cwd, log paths and /api/auth/captcha200. PASS.                                                                                               |
| 9           | Actual Baota domain binding plus exact README Nginx locations in isolated HTTP origin. PASS for local configuration.                                                             |
| 10          | nginx -t, origin Host-header200, inactive/v2 410, verified local TLS edge to HTTP origin200. PASS for isolated topology.                                                         |
| 11          | Real Windows client/admin/business/Push-Pull/COS acceptance NOT RUN; remains a deployment gate.                                                                                  |

README 1–10 technical sequence passed within the stated isolated boundary; complete production 1–11 acceptance remains incomplete. The actual current public service separately returned captcha200 with CF-Ray and normal TLS verification at 2026-11-06T01:57:14.8880182Z. That read-only check is not acceptance of this ZIP on the remote server. The user's earlier production migration/Seed/grant/localhost/Nginx results are user-reported, not rerun remotely here.

## Package and regression checks

Root start.mjs loads root .env before importing API; canonical README-DEPLOY.md and both README aliases byte-identical. Manifest source, entry/readme hashes and all 17 SQL hashes verified. No external ecosystem or old CJS launcher. Software version remains 0.0.0-development, active API v1, migrations17/latest014, target directory /www/wwwroot/api-pr/v1/. Retained old files do not authorize rollback against an incompatible schema.

Release tests: `node --test tests/release/*.test.mjs`: 14 PASS. `node --check start.mjs`: PASS. Server/shared/migration source unchanged from 6b18850 (explicit git diff empty); exact unchanged-boundary full PostgreSQL evidence219 PASS/3 opt-in live COS SKIP is recorded in SERVER-NO-PGCRYPTO-20261106.md. New artifact independently re-executed fresh migrations, Seed, login, restricted role and manifest checks; previous test results do not replace package acceptance.

Controllers and concise output are retained under the task-owned .cache/readme-order directory (untracked). Harness-only failures preserved: generic psql password prompt, OS Python vs panel Python, Linux PID visibility, arbitrary PM2 nickname vs actual script path, and one negative-check URL mistakenly omitted /api (404). These were controller corrections, not API changes. The actual README uses /api/auth/captcha.

The shared original worktree was switched by a concurrent task; this artifact was archived from its fixed source before unrelated business edits. Final records live in an independent task worktree; concurrent work was neither staged nor overwritten.

BLOCKER: complete production/real Windows/COS acceptance not performed. DEFERRED: user uploads replacement ZIP after backup and stops existing PM2 project before replacement; preserve existing database and credentials, do not reset Seed/passwords. WARNING: real panel file-mode OS account/name must be observed, not assumed; database runtime identity remains honsen_api. All original release/native/Toolbox holds remain open. This is a deployment candidate, not SERVER_V1_READY or stable publication.

Missing .env negative regression PASS: exit1 STARTUP_FAILED ENOENT; restored same real Baota project, one online instance, captcha200. Task-owned container/Compose volume cleanup PASS; synthetic private credentials and installer log removed.
