# Integration B — 2026-11-04

Tested source: `39b3d65` on `codex/v1-resume-20261104`. This independent run verifies the integrated HPA frontend/server slice and adjacent payment regressions. No business code, migration, dependency lock, runner, or global Codex configuration changed.

## Fresh verification

- `npm run lint`: PASS across workspaces; existing App.tsx and AttachmentPanel.tsx state-in-effect warnings remain.
- `npm run typecheck`: PASS across workspaces.
- `npm run build`: PASS across workspaces; existing Vite chunk warning (1222.99 kB) remains.
- `npm run test --workspace @honsen/desktop`: PASS16/16.
- Initial server HPA/formal run without TEST_DATABASE_URL: 2 passed, 2 skipped. Superseded for those acceptance items by the fresh isolated PostgreSQL run below.
- `npm run test --workspace @honsen/server -- src/sync/hpa-formal src/sync/formal-issue src/sync/payment-conflict src/db/migration-runner.test.ts`: PASS18/18, six files, zero skipped, using controller-owned disposable PostgreSQL project `honsen-v1-integration-20261104` on 127.0.0.1:54329. There is no standalone payment-conflict test file; its filter adds no coverage.
- `npm run test --workspace @honsen/server -- src/sync/expenditure.test.ts src/sync/expenditure-postgres.test.ts`: PASS16/16, zero skipped. This includes the actual payment-conflict adjudication regression and retained ledger originals.
- Initial HPA Playwright launch failed because Chromium headless shell was absent. `npx playwright install chromium` successfully installed the repository-matched browser from the official Playwright CDN; no lockfile change.
- `npx playwright test tests/e2e/hpa-formal.spec.ts tests/e2e/allocation-quote.spec.ts`: PASS2/2 after installation. HPA approved-history issue failure/retry and quote-rejection form preservation passed. Evidence is browser/mock-IPC DOM evidence, not native business acceptance. Standard screenshots/report are under ignored test-results/ and playwright-report/.
- Targeted `npx prettier --check` for the HPA DOM/parser/PostgreSQL test files: PASS.

PostgreSQL URL was assembled only in the test process from local .env.test, without printing credentials. The controller owns database cleanup. Rust checks are delegated to Agent A to avoid competing Cargo builds; this document does not claim their results.

## Native scope and remaining issues

- BLOCKER for HPA native acceptance: existing runner has no HPA mode/script; `apps/desktop/src-tauri/target/debug/HonsenProcure.exe` is absent. Existing g2-formal-pull.mjs exercises OPA owner-price fields and cannot prove HPA. No unexecutable HPA harness was added. Native issue/Push/second-installation Pull/restart remains untested in this slice.
- DEFERRED: actual Windows two-installation HPA/OPA release acceptance, native credential/login gates, formal printing/Excel, broader business closure and production deployment.
- WARNING: lint/build advisories above do not fail these checks. The old PR20 CI failure is superseded by controller-fresh successful run40195470167 at a2b73ae9; it was not repaired again.

No parent/milestone is closed and no merge, Release, production database mutation, or deployment occurred. Existing required migrations are exercised by the isolated migration test; this task adds none.
