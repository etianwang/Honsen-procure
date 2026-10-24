# V1 RC integration ledger

Scope: one T15 candidate integration slice; authorized source integration, targeted repairs, commit/push/CI and new Windows/Linux packages. No PR merge, stable Release, production deployment or user-data deletion. Status DEV_IN_PROGRESS / production RELEASE_BLOCKED.

## Source provenance and implementation

| Source                              | Exact SHA                                | Integration                                                                        |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| codex/v1-unified-baseline           | d3485144b075dceb8082e493c94791aab699a3af | Native isolated worktree created here                                              |
| codex/procurement-t09a / Draft PR19 | 98537d22b17853752203e11646bd1966ef6d1d03 | Fast-forward; contains baseline, payment/reversal/COS and compatibility migrations |
| codex/release-toolbox               | f9145e1e4f62958e379f8f81c08971a9383c116b | Explicit merge; includes five-file formatter repair                                |
| B / codex/v1-business-flow          | No new remote commit at selection        | Not imported; future reliable commit can update candidate                          |

Conflicts: only deploy/linux/honsen-procure.service and memory.md. Service retains baseline readiness condition, Restart=no, protected config and dedicated runtime account; paths now /www/Honsen-procure. Memory retains both sides. No directory overwrite. Cargo and Rust module merge is additive; payment and authorization application implementation remains from PR19.

Actual repair: the old partial Linux copier omitted the reviewed controller/grant/checker and used incompatible app/ paths. New builder creates a self-contained shallow Git snapshot at the exact commit, installs locked Linux dependencies, builds API, runs package checks, inventories all files and emits an external manifest plus tar/SHA256. All committed migrations and notices travel with the snapshot. Legacy all-table runtime grant shortcut now refuses execution. No business schema or wire protocol changed.

Affected callers: deploy.sh, traffic-watchdog.sh, verify-running-release.sh, service template, deployment example, Linux builder/manual, existing real-systemd/controller E2E fixtures and the existing quality workflow. Database risk: no database mutation in integration; migration/runtime authority remains separated. Production restore remains externally authorized.

## Validation ledger

- RED: new package regression rejected /opt path. GREEN: /www path, readiness/no-restart, payment migration filenames, controller dependencies and absence of blanket grants passed.
- Fresh npm ci with Node24.18.0 succeeded; lockfile unchanged. Workspace format, lint, strict types and production builds passed. Existing two effect warnings and bundle warning retained.
- Remaining checks and exact artifact hashes are appended before handoff. No native or production PASS implied by this ledger.

## Remaining gates

- BLOCKER: exact RC CI and final package checks until actually complete.
- BLOCKER: native Windows login/payment/reversal/COS/two-client acceptance on a working credential store; prior failed run is environment evidence only.
- BLOCKER: installed Windows/Toolbox launch/update/uninstall and retained SQLite/outbox/attachments/config evidence; current URL/launch contract discrepancy awaits approval.
- BLOCKER: core procurement, print/PDF/three-language and original parent acceptance cannot be inferred from package compilation.
- DEFERRED: B/A subsequent uncommitted development is excluded from this candidate.
- WARNING: production topology, protected /www ancestors, domain/TLS, roles/offsite backup/restore and external authorization require operator evidence. Do not weaken checks for a www-writable tree.
