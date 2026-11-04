# Zod bounded-collection security patch — 2026-11-04

Status: patch implemented and targeted regression PASS. Full database/native release acceptance remains separate.

## Confirmed defect and minimal repair

[GitHub reviewed GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) identifies versions below 4.6.6 as affected. [Upstream patch a0ebf97](https://github.com/colinhacks/zod/commit/a0ebf97) places existing collection-size bounds before element validation; it does not introduce a bound for unconstrained arrays.

The existing production `syncPushRequestSchema.events.max(100)` regression submits 10,000 invalid synthetic events. Before upgrading it accumulated **10,001** issues and failed the new one-issue expectation. After installing 4.6.6, the same test produces exactly one `too_big` issue at `events` and passes.

Only shared/server package manifests, the corresponding Zod lock entry and this focused regression change. Zod is pinned to exact 4.6.6; the trusted npm tarball integrity remains locked. No other dependency, schema limit, API contract, business data, migration, or authorization behavior is changed.

## Executed evidence

- `npm install zod@4.6.6 --workspace @honsen/shared --workspace @honsen/server --save-exact --ignore-scripts --no-audit --no-fund`: one package changed; local installed version confirmed 4.6.6.
- `npm run test --workspace @honsen/shared -- src/sync.test.ts`: RED on 4.6.5 (10,001 issues), GREEN 3/3 on 4.6.6.
- Full workspace tests: shared26/26, desktop23/23, server73 PASS /99 SKIP. The run did not have `TEST_DATABASE_URL`; PostgreSQL-dependent and existing external-service opt-in tests are skipped, not passed. This limits fresh formal/payment PostgreSQL compatibility evidence.
- Workspace lint, strict typecheck and production build PASS; existing React effect/chunk advisories remain.
- Focused production UI DOM: payment, immutable reversal/conflict, attachment pending/reload and HPA4/4 PASS; SPO, print preview and persisted locale3/3 PASS. These fixture tests are not a replacement for native EXE/IPC/HTTPS/SQLite/PostgreSQL/COS acceptance.
- Relevant Prettier and diff checks PASS.

## Remaining limitations

Unconstrained arrays, including existing RFQ item and response schemas, do not acquire a bound from this patch. Their application limits require their own justified scope; no arbitrary business limit was added. No production installation, database, formal Release or deployment occurred. Full native/installed candidate evidence must name the subsequent source commit; earlier SHA-specific native results are not silently relabelled.
