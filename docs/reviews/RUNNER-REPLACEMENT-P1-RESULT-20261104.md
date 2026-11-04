# Runner replacement P1 — execution and acceptance

Status: **approved implementation in progress; P1 remains OPEN**. User explicitly approved the paired A+B scope and isolated acceptance on2026-11-04. Type B confirmed correctness defect, selected T15 slice. This does not reopen the accepted installation-directory P1.

## Boundary and source

Baseline production source90f28043aecd74a90d3267952b922aea45845a88; evidence checkpoint3604205. New tested production SHA must be recorded after both sides are integrated, not inferred from an evidence commit. Worker callers are existing public apply→temporary worker and launch→apply→worker. NSIS keeps identity, original installation path and synchronous parent/result contract. No API/shared/schema/migration/business/outbox/COS change. No automatic rollback, directory migration, main modification, merge, Release or deployment.

The five Toolbox sources and local integration were reviewed for the approved plan. Confirmed gap is complete Runner replacement and success validation. Private installer diagnostic output is separate from the existing Rust adapter log: minimum installer UUID/PID/phase/error/byte-count/elapsed/outcome, no credentials or business content, no new public Result field or CLI parameter.

## Evidence so far

| Acceptance                                                        | Actual status                | Evidence / exact limit                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserved019→010 false success                                    | FAIL                         | Previous90/010 evidence in WINDOWS-CANDIDATE-010-20261104.md; old1943 Runner survived result success.                                                                                                                                                                              |
| New worker path/PE-version regression                             | Builder PASS, native pending | Current B diff:12 focused tests,144 full library tests,7 opt-in ignored; fmt/Clippy exit0 with warnings. .cache/runner-p1-worker-{targeted,full-lib,clippy}.log. No new source SHA assigned yet.                                                                                   |
| Independent worker review                                         | PASS for code review only    | A and controller checked success/restart ordering and strict3/4-part version handling. No native acceptance inferred.                                                                                                                                                              |
| Isolated old019 fixture                                           | Ready                        | Existing tracked Sandbox entry; networking/clipboard disabled, narrow readonly input/evidence mapping. .cache/runner-replacement-p1-011/evidence/{summary.json,p1-before.json}; registered Runner hash1943cac8..., original synthetic directory and SQLite/marker hashes captured. |
| Fresh final candidate / running019 upgrade                        | NOT RUN                      | Requires integrated A+B source and exact effective payload provenance.                                                                                                                                                                                                             |
| New launch→apply→worker parent chain                              | NOT RUN                      | Local mechanism and qualified live canonical asset must remain separate.                                                                                                                                                                                                           |
| Rename/write/compare/version/UAC refusal                          | NOT RUN                      | Must retain actual exit/result/no-restart plus fixture-state proof.                                                                                                                                                                                                                |
| Exact ownership cleanup / malicious receipt and reparse retention | NOT RUN                      | Requires actual helper and isolated sentinels; no unknown data deletion.                                                                                                                                                                                                           |

## Open items

- BLOCKER: complete paired installer implementation and targeted native file-operation tests, then independent review.
- BLOCKER: exact-source package and real running-old-parent upgrade with package-byte match and retained synthetic data; no success based only on version/result JSON.
- BLOCKER: changed-boundary failure/cleanup/retry acceptance. An installer success with old Runner remains FAIL.
- BLOCKED_ENV: no qualified stable production asset for actual canonical immediate-update chain. No fabricated Release.
- DEFERRED: unapproved cross-repository Toolbox scope3 and original full V1 security/recovery/export/language final gates.
- WARNING: existing Clippy warnings remain; test fixtures and guest need owned cleanup after acceptance.

No parent checkbox or full release gate is closed by this in-progress report.
