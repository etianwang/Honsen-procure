# Fixer Bug Queue

Only independently reproduced defects or environment blockers belong here. A Builder report alone is not a verified result.

| ID | Status | Delivery / responsible module | Reproduction and evidence | Impact | Owner / next action |
| --- | --- | --- | --- | --- | --- |
| ENV-001 | INVESTIGATING | QA PostgreSQL environment | Windows PowerShell reports `docker` is not recognized. Dev A recorded `Wsl/Service/E_UNEXPECTED` while rerunning the final tax-template PostgreSQL test set. Fixer has not yet reproduced the WSL error itself. | T04 `a82050d` cannot receive a PostgreSQL QA PASS; required integration gate remains open. | Fixer: inspect WSL/Docker availability without touching existing test data, then rerun against the approved disposable Compose database if available. |
| INT-001 | OPEN (design-owned) | T08/T10 formal issue synchronization | `6a006ed` adds local formal fields to a purchase-order outbox payload; current server contract does not yet register/preserve them. | Formally issued orders must remain pending; no server Push test may treat this as supported. | Dev D/T10, per coordination commit `8c1f607`; do not patch on the T08 branch. |
| INT-002 | OPEN (design-owned) | T09/T10 procurement expenditure synchronization | `cbc129a` writes local append-only `procurement_expenditure` outbox events, while shared schema/server projection/Pull are not yet present. | Payments remain pending and cannot be presented as synchronized. | Dev D/T10, per coordination commit `49a0b66`; do not patch on the T09 branch. |

## Resolution rule

A `FIXED` entry must include the responsible commit SHA, the original failing test or reproduction, a fresh rerun result, and the related regression result. An `ACCEPTED` slice still needs integration-worktree evidence in `DEV_HANDOFF.md`.
