# Bug Queue — scoped management checkpoint

This branch first gains this index after management baseline `e5e46362`. Full historical queue/evidence remains in `b0a6069:docs/agent-coordination/BUG_QUEUE.md` and `13b22ff:docs/agent-coordination/BUG_QUEUE.md`; this does not erase or reopen those records.

## G1-QA-001 — CLOSED (independent QA, 2026-10-19)

- Confirmed defect: management-command HTTP401 returned an error but left cached local authorization usable. Independent failure `b0a6069` tested `85d0565`; FIX2 `13b22ff` was builder READY_FOR_RECHECK only.
- Independent Security QA `fix2_independent_qa` now gives PASS and explicitly permits bounded closure on **`13b22ffe8aa294535f9036eda32d7cfc81f6481f`**. Fresh independent run **`native-smoke-20261019115437`**, EXE PIDs3428/13116, plus Rust management4/4/session5/5 and API/barrier15/15. Four real management401 methods deny cached context/list/known selection/conflict source; late A/B and A1/A2 isolation, non401 behavior, SQLite DELETE-failure fail-closed and data retention pass. Full request/session evidence and limits: [QA_REPORT](QA_REPORT.md).
- No further FIX2 implementation or duplicate recheck is queued absent a changed boundary/new defect. Candidate is not merged or accepted as management/main HEAD.

## Existing open boundaries (not new task IDs)

- **G1 OPEN:** production conflict UI lifecycle remains separate and BLOCKED/unaccepted.
- **T10-A / G2 OPEN:** existing formal-field Pull DTO/projection and approved→issued transition gaps; [minimal prepared scope](../BUILD-TASKS.md#t10-a--g2-preparation--2026-10-19-scope-only-not-implementation). No production code/test added this round.
- **T10 / T10-SEC-001 / original P1 / Formal hold OPEN; NATIVE-008 CLOSED.** Other original work remains in BUILD-TASKS; this index creates no duplicate task system and authorizes no broad audit or new NATIVE matrix.
