# PR #17 independent P1 recheck — CHANGES_REQUIRED

Production SHA: **`8c7ba265bf963fd47e9e3a77876b2f022830fde9`**. Target: `codex/v1-unified-baseline` / `ffe42d1c917042f18343c2e068264b2afa2fb106`, an ancestor. Reviewed 2026-10-23. This is fresh independent execution, not adoption of the builder's acceptance verdict. PR #17 remains Draft.

## P1-01 remains blocked: accepted historical country events poison replay

The real authenticated Push handler accepted this complete country payload in the shared contract's camelCase form. PostgreSQL stored it and Pull returned it with envelope `version: 1`:

```json
{
  "kind": "country",
  "id": "04d29f95-27cb-4c25-8fe8-6f554dbfa62f",
  "businessCode": "04d29f95-27cb-4c25-8fe8-6f554dbfa62f",
  "name": "QA",
  "timeZone": "UTC",
  "isActive": true
}
```

The shared country contract does not require payload `version`. However, Rust's `ReferenceMasterDataInput` requires snake_case `business_code`, `time_zone`, `is_active` and payload `version`. `project_remote_master_data_change` deserializes the raw payload directly and propagates `InvalidInput`, rolling back the whole page. The new malformed-catalog quarantine handles material/supplier/price, not this reference event.

A B-only user first advances past the filtered A supplier/quote. After A is granted, the persisted authorization task correctly starts at zero. The actual historical page then fails. File SQLite is closed/reopened between attempts:

```text
attempt=1, result=Err(InvalidInput), incremental=1046, replay_cursor=0, replay_until=1056
attempt=2, result=Err(InvalidInput), incremental=1046, replay_cursor=0, replay_until=1056
typed reference parse=Err(Error("missing field `business_code`", ...))
```

The pending Outbox remains present and unacknowledged. The normal cursor is retained, but the production HTTPS loop drains replay before ordinary Pull. Retry/restart cannot progress; a later correction does not remove the old event from immutable history. Newly authorized suppliers/quotes and subsequent changes remain unavailable.

This is a direct historical-reference compatibility gap in the selected P1 repair, not a request to reopen full T04. Existing reference fixtures serialize the Rust snake_case form and include version; their passing results cannot establish this accepted server-to-client contract.

### Code locations at the production SHA

- `apps/server/src/sync/service.ts:267`: accepts the normalized shared reference contract.
- `packages/shared/src/master-data.ts:71`: country contract uses camelCase and has no payload version requirement.
- `apps/server/src/sync/postgres-store.ts:1180`: retains the accepted original reference payload.
- `apps/desktop/src-tauri/src/lib.rs:1122`: reference DTO requires snake_case fields and payload version.
- `apps/desktop/src-tauri/src/lib.rs:8765`: raw deserialization aborts the page.
- `apps/desktop/src-tauri/src/lib.rs:6448`, `:6476`: authorization change starts replay at zero; replay precedes incremental Pull.

**Minimum repair:** normalize the already accepted historical camelCase and desktop snake_case reference forms at the trusted projection boundary, use the trusted envelope version, and validate identity/reference consistency. Do not invent business fields, reset the normal cursor, skip/delete historical records or fabricate dependencies. Keep genuinely ambiguous references recoverable/auditable. Add this real PostgreSQL → SQLite contract regression to the bounded acceptance checks.

## Independent execution

Node **24.18.0**, committed lockfile via `npm ci`; disposable WSL2 Ubuntu normal user `honsen-dev`; Docker/Compose/buildx verified; PostgreSQL **16.15**, database `honsen_pr17_independent`, loopback port 54329; actual file/in-memory rusqlite. Worktree, TEMP, caches and artifacts are on E:. Cargo dependency artifacts were copied into a separate QA target and the QA crate was compiled in this checkout. No production database was accessed.

| Boundary                                                                                                                  | Result                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated server B-only cursor past A history; grant, bounded 500-row replay, new event during replay, revoke/regrant | PASS at handler/PostgreSQL boundary. 505 normal versioned Push events force a full page. This is not complete client acceptance.                                                                                                                                                                          |
| Incomplete supplier/new quote/quote update, forged ID, unknown material, cross-country supplier                           | Rejected; unchanged change-log count and entity non-writes asserted.                                                                                                                                                                                                                                      |
| Legacy nullable/alias supplier and quote payloads, empty tombstones                                                       | PASS at authenticated handler/PostgreSQL boundary.                                                                                                                                                                                                                                                        |
| Bad supplier history, healthy later data, raw originals, administrator repair and audit/idempotency                       | PASS with a restricted PostgreSQL API role. Actual purchaser plus forged administrator metadata is rejected by the DB-backed role check.                                                                                                                                                                  |
| Quarantine permissions                                                                                                    | SELECT/INSERT/UPDATE work; DELETE and public schema CREATE fail with `42501`. Existing scope tables also receive UPDATE, required by PostgreSQL `FOR SHARE`; these are separately provisioned historical permissions, not production policy changes. Unique NOLOGIN test roles are removed by finalizers. |
| Independent server harness                                                                                                | **3/3 PASS**, 62.23 seconds.                                                                                                                                                                                                                                                                              |
| Fresh existing relevant server regressions                                                                                | **11/11 PASS**, catalog integration (9) and catalog schema tests (2).                                                                                                                                                                                                                                     |
| Fresh existing relevant SQLite regressions                                                                                | **5/5 PASS**: authorization replay migration/durability (2), late supplier/quote chronology (1), malformed catalog recovery (1), rejected Outbox progress (1).                                                                                                                                            |
| Real authorized PostgreSQL response → file SQLite replay/restart                                                          | **FAIL**, exit 101, reproducible on both restarted attempts.                                                                                                                                                                                                                                              |
| Full grant/restart/window convergence and draft/formal snapshot/audit retention through that convergence                  | **NOT PASSED**: blocked by this actual reference event. Lower-level fixtures are not substituted for the failed chain.                                                                                                                                                                                    |
| QA source quality                                                                                                         | Server strict typecheck/lint, Prettier and Rust formatting checked; no production dependency/lockfile/runtime behavior changed.                                                                                                                                                                           |

Initial environment/fixture failures are retained as history, not PASS: PG was not yet healthy on the first attempt; an explicit UUID cast was needed; the initial SELECT-only role lacked row-lock UPDATE privilege; a 30-second 505-write timeout left writes running and invalidated following assertions. The completed bounded 120-second run passed all three server scenarios. The later SQLite error is a production contract defect, not one of these fixture issues.

## Reproduction and evidence

QA branch: `codex/qa-pr17-p1-final`, based exactly on the production SHA. Its only `lib.rs` difference is a test-only include inside the existing `#[cfg(test)]` module. The test drivers, synthetic authenticated responses and outputs are committed; tokens/passwords are excluded. The containing evidence commit and remote equality are supplied with final delivery.

1. Start disposable PostgreSQL with `docker compose --project-name honsen-pr17-independent --env-file .env.test -f compose.test.yaml up -d --wait`. Use an ignored test-only `.env.test`; never production `.env`.
2. Set `TEST_DATABASE_URL` to that instance, TEMP/cache/Cargo target to E:, and `PR17_QA_TRANSCRIPT` to an E: JSON output path.
3. Run `npm run test --workspace @honsen/server -- src/sync/pr17-independent.test.ts --testTimeout 120000`. This uses authenticated `app.inject` handlers, not a fresh network-TLS/EXE login acceptance test.
4. Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib pr17_independent_postgres_transcript -- --include-ignored --nocapture`. It must fail on the reviewed code. For SQLite-only reproduction, set `PR17_QA_TRANSCRIPT` to the committed response JSON below.

Evidence: [authenticated responses](evidence/pr17-p1-independent/authenticated-pull.json), [independent server](evidence/pr17-p1-independent/independent-server.txt), [focused server](evidence/pr17-p1-independent/focused-server.txt), [SQLite failure](evidence/pr17-p1-independent/sqlite-failure.txt), [focused SQLite](evidence/pr17-p1-independent/focused-sqlite.txt).

- Tested raw JSON SHA-256: `A6BD6D199F96817B4EA96FC3F308145530A0C360FF6920A1B038B699EE075EE8`.
- Formatted committed JSON SHA-256: `BFE68BF6FD203F8FD3A19E0474F01D87E635E491AC9723CAFB5713A4126CB4F0`. Parsed deep equality to the tested raw file was asserted.
- Production [quality run 39983927627](https://github.com/etianwang/Honsen-procure/actions/runs/39983927627) is SUCCESS on the exact production SHA; both push runs also succeeded. CI does not cover or override this failed contract reproduction.

## Verdict and gates

**CHANGES_REQUIRED.** P1-01 is not independently closed. Supplier/quote rejection and isolated recovery subcases passed, but legal historical-reference/client integration fails; do not declare both P1 QA PASS. Keep PR #17 Draft; it cannot enter READY_TO_MERGE until this bounded repair and independent recheck pass on the next production SHA.

**BLOCKER for V1 production release:** real Windows EXE online re-login after revocation remains NOT PASSED. The coordinator's gate adjustment remains in effect; this release hold is separate from the code defect. Overall V1 security QA is not passed. **DEFERRED:** full T04/T10, Windows A/B and Linux deployment QA were not repeated. No main/production branch change, PR merge or production deployment occurred; original parent/milestone gates remain intact.
