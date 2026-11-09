# Unified candidate workspace / PostgreSQL regression — 2026-11-04

**Tested source:** `100011d41383bac4a7533c388572b4ac65bb97ee`.

**Result:** PASS for the executed workspace suite, with three explicitly skipped existing live-service tests. This evidence does not change the scope of native/installed acceptance reports.

## Actual environment and command

The controller bootstrapped the disposable PostgreSQL16 service using the repository's `compose.test.yaml`, ignored `.env.test`, project `honsen-candidate-tests-100011d`, loopback port54329 and no persistent volume. Ubuntu-24.04 currently has only root/system accounts. Root was used solely by the controller to bootstrap the Docker test service; tests ran in the Windows development process. No normal WSL development user was fabricated, default user/group changed, or native-runner guard bypassed.

The Windows test process read the ignored test-only fields without printing them, validated test database/loopback port boundaries, and loaded `TEST_DATABASE_URL` only in its process environment. An actual `SELECT 1 AS ready, version() AS version` returned `sqlReady=true`, `postgres16=true` before tests. TCP-listening alone was not accepted as readiness. The process environment and in-memory configuration were cleared in `finally`.

Exactly one `npm run test` ran with that database URL. The command already includes PostgreSQL suites, so no second `test:postgres` command ran.

## Fresh results

| Package           | Actual result                                   |
| ----------------- | ----------------------------------------------- |
| Desktop           | 27/27 PASS                                      |
| Server            | 169 PASS, 3 SKIP; 30 test files PASS, 1 skipped |
| Shared            | 26/26 PASS                                      |
| Workspace process | exit0                                           |

Retained safe raw command log: `.cache/candidate-100011d-workspace-tests.log` (Windows source root H:\Honsen\Honsen-Procure).

This fills the missing PostgreSQL regression portion of the Zod4.6.6 patch: the earlier run had73 server tests passing and99 skipped without a database URL; this run enables96 PostgreSQL-dependent tests. Three existing live-service opt-in tests remain skipped because live COS flags/configuration were deliberately not enabled in this suite. Their exact native COS evidence remains the independent authorized-prefix native report, not a claim that the skipped tests passed.

## Cleanup and limits

No production database, real business records or credentials were used. Controller owns teardown of this service/network/keeper; the Windows test agent notified the controller immediately on completion and did not remove another agent's stack. Cleanup confirmation is recorded by the controller in the unified handoff. No application/shared dependency source was changed during this regression. Only QA documents were dirty; do not replace the tested source SHA with a later documentation checkpoint.

Full product three-language coverage, complete installed security, PDF/physical printing, backup recovery and Toolbox joint gates remain governed by their individual evidence and open requirements. No PR merge, main change, Release or production deployment occurred.
