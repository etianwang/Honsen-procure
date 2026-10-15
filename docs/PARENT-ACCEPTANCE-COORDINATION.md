# Parent Acceptance Coordination — T04, T08, T09, T10

**Baseline:** `74365f0` (`2026-10-15`); fetched `origin/main` is `5139cc8`. This document coordinates integration only. It does not mark any parent task complete.

## Operating rules

- The primary agent alone edits this file and integrates approved agent commits.
- Each developer uses one isolated worktree and owns only the paths listed below. Agents must not change this document or another package's public contract without recording a proposed interface change here for the primary agent.
- Preserve `.honsen-e2e/`, `apps/desktop/src-tauri/.honsen-native-e2e/`, existing commits, and all historical records. No deployment, production connection, destructive action, Toolbox implementation, or release work is authorized.
- A work package is ready for QA only after its focused tests and a reproducible Playwright DOM proof pass. QA records exact command, result, reproduction, logs/artifacts, responsibility, and retest result below. Parent acceptance requires the original full gates, not a local slice.

## Dependency map

```text
T02 + T03 ──> T04 local/deployed master-data acceptance ──────────┐
T06 + T07 ──> T08 formal execution/snapshots ──> T09 receipt/payment ─┼─> T10 final multi-device sync
                                      │                 │              │
                                      ├── formal event contract ────────┤
                                      └── T11 file archival ──> T09-C ──┘
```

- T04-A needs an authorized deployment account/setup window. It is an external authorization item, not a reason to stop local verification, native smoke, or test preparation.
- T08-D's local OPA/HPA/SPO namespace is a prerequisite for T10's formal-number collision and snapshot tests. The server registers but never renumbers local documents.
- T09-C is jointly accepted only after T11 owns actual file ingestion/compression/upload/archival. T09 owns receipt-to-attachment metadata and receipt-domain checks. This boundary is proposed in `BUILD-TASKS.md` and still requires approval before either task claims the other's criterion.
- T10-F cannot close until T04–T09 original acceptance gates close. T10-B/C/D/E can nevertheless be prepared and tested against implemented interfaces without weakening those prerequisites.
- **Approved internal interface record (2026-10-15):** T09 may create local, append-only `procurement_expenditure` mutations and their transactional SQLite outbox records. The event is retained pending sync; it is not shown as synchronized without a server acknowledgment. T10 owns the shared sync entity schema, PostgreSQL projection/Pull and multi-device proof. This uses the already confirmed PRD/SPECS/DECISIONS domain name and does not authorize a ledger, reimbursement, advance-settlement, owner-mode payment, or server-side contract change in T09's branch.
- **Approved internal interface record (2026-10-15):** T08's owner formal-issue command is `issue_owner_formal_order({ orderId })`. Its existing `purchase_order` outbox payload will add `documentType`, `formalDocumentNo`, `formalInstallationId`, string `formalSequence`, `formallyIssuedAt`, and `formalSnapshotJson`. T10 owns matching immutable server registration and Pull preservation. It must reject collisions/divergence without renumbering, replacing, or recalculating the formal snapshot.

## Remaining parent acceptance checklist

### T04 — master data

- [ ] **T04-A (external authorization):** run the authenticated, non-destructive unified seed workflow against the authorized deployment; do not record real data or secrets in repository evidence.
- [ ] **T04-B:** verify deployed immutable codes, project bindings, print defaults (language/currency/tax/address/contact), and authorized exchange-rate maintenance.
- [ ] **T04-C:** preserve full API/Rust/DOM/native-desktop evidence after T04-A/B. Separate synthetic fixtures from deployment evidence.
- [ ] **Integration evidence:** prove all master-data entities are visible cross-client via canonical cursor Pull and correctly scoped; current Push projection slices and selected REST publication coverage do not replace this proof.

### T08 — formal execution and snapshots

- [ ] **T08-B / OPA-3:** add formal offline issue with UUID, immutable snapshot, local number and OPA/HPA/SPO namespace; prove no number/event on invalid/missing rate and no later catalog/rate rewrite.
- [ ] **T08-C:** complete Honsen-market actual expenditure and the optional RFQ send/close and supplier/currency/terms lifecycle, retaining sent snapshots.
- [ ] **T08-D:** full regular-route/native DOM, integration, migration and gate evidence after number design; preserve historic display numbers and separate document type from supplier code.
- [ ] **OPA-4/5/6 dependencies:** print redaction (T12), partial owner receipt (T09), and immutable server registration/conflicts (T10) remain required before the owner flow is fully accepted.

### T09 — receipt/payment/retention

- [ ] **T09-A:** multi-batch cumulative receipt with quantity, unit/date/receiver; over-receipt reason; append-only multiple Honsen payments with voucher warning; owner payment denial.
- [ ] **T09-B:** completed-with-conditions reason and all-role closed-order edit/delete denial with retention of audit/PDF/attachments.
- [ ] **T09-C (blocked on approved boundary/T11):** receipt attachment links plus the joint real file ingestion/compression/ten-photo/archival proof.
- [ ] **T09-D:** regular DOM, integration, failure/retention and full affected-package evidence after A–C.

### T10 — synchronization

- [ ] **T10-A:** project child orders/RFQs/receipts/attachments, stage dependencies, and preserve formally issued owner snapshots when catalog/rates change or revoke.
- [ ] **T10-B:** startup/login Pull, bounded backoff with jitter, connectivity/pending status, reconnect and cursor recovery; injection tests cover restart, timeout-after-commit, duplicate and partial batch.
- [ ] **T10-C:** desktop WebSocket orchestration and session-revocation lock; missed hints must recover through cursor Pull.
- [ ] **T10-D:** production-route administrator conflict resolution with reason/version/outbox audit and immutable-record restrictions.
- [ ] **T10-E:** two-device offline/reconnect, idempotency, conflict DOM/API evidence on disposable PostgreSQL, including formal-number and divergent-snapshot conflicts.
- [ ] **T10-F:** all original prerequisite and quality gates complete; no required database/native/multi-device suite skipped.

## Work ownership and handoff queue

| Owner | Isolated branch/worktree | Scope now | May change | Handoff definition |
| --- | --- | --- | --- | --- |
| Dev A | `codex/t04-parent-acceptance` | T04-B/C acceptance preparation and remaining cross-client master-data proof; do not deploy | `apps/server/src/master-data/**`, relevant sync tests, T04 docs | Focused PostgreSQL + Rust/DOM evidence, no external deployment claim |
| Dev B | `codex/t08-formal-execution` | T08-B OPA-3 design/test implementation; T08-C only if it does not overlap receipts/payments | order/shared formal contracts, desktop formal issue flow/tests | Formal local number/snapshot behavior with migration and regular DOM proof |
| Dev C | `codex/t09-receipt-payment` | T09-A/B payment/receipt/closed-retention; document only the T11 boundary | receipt/payment services, components/tests, T09 docs | Transaction/role/retention tests plus regular DOM proof; no file-ingestion claim |
| Dev D | `codex/t10-runtime-sync` | Starts after a free slot: T10-B/C/D runtime orchestration plus the shared `procurement_expenditure` sync contract/projection; consume, do not redefine, formal contracts | desktop sync runtime/UI/tests, server sync tests | Failure-injection and DOM proof; no prerequisite closure claim |
| QA | `codex/parent-acceptance-qa` | Starts after a free slot: validate each handoff and report/return failures | test artifacts and this table only through primary-agent requests | Reproducible pass/fail report and retest result |

## QA handoff ledger

| Package | Commit | QA status | Reproduction / command | Failure and responsible owner | Retest |
| --- | --- | --- | --- | --- | --- |
| T04 acceptance prep | — | QUEUED | — | — | — |
| T08 formal execution | — | QUEUED | — | — | — |
| T09 receipt/payment | — | QUEUED | — | — | — |
| T10 runtime sync | — | BLOCKED ON FREE SLOT / interfaces | — | — | — |

## External authorization queue

1. **T04-A:** authorized deployment account/setup window and approved actual initial-master-data initialization.
2. **T09-C/T11:** explicit approval of the receipt-attachment boundary and subsequent T11 archival work.
3. **Toolbox/production:** no authorization requested for implementation, deployment, installer, update or release in this coordination cycle.
