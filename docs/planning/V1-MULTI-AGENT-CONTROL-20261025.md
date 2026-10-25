# V1 multi-agent RC control — 2026-10-25

Status: IN PROGRESS / RELEASE_BLOCKED. This is the existing T15 integration
slice, not a new task register. Original T00–T15, milestone dependencies,
security and Formal holds remain unchanged.

## Isolation and authorization

Three real agents were created and dispatched: `agent_a_payments_cos`,
`agent_b_procurement`, and `agent_c_release`. Each exclusively edits its existing
worktree. The controller uses its own native-created
`C:/Users/This PC/.codex/worktrees/v1-rc-control/Honsen materials` on
`codex/v1-rc-control-20261025`. All new caches, temporary files and artifacts use
E:. Existing worktrees, including the original checkout's tracked deletions and
the older dirty integration tree, are preserved.

Attaching the original RC worktree was rejected because another chat owns it.
The controller therefore started from its exact committed source
`700387baefec934b7fc370caece53d7445960496` without editing that checkout or its
local branch. Only a non-force, fast-forward remote RC update is permitted.
The user authorized development commits, pushes, candidate integration and CI;
no main/PR merge, stable Release, production deployment or business-data removal
is authorized.

## Source ledger

| Owner | Source branch          | Starting SHA                             | Selected bounded work                                                         |
| ----- | ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| A     | codex/procurement-t09a | 98537d22b17853752203e11646bd1966ef6d1d03 | T09/T10 payment-conflict decisions and effective-payment attachment ownership |
| B     | codex/v1-business-flow | 03614e2f053ec1707a6f43a34749c767ea2e9b1e | T08 quote supplier binding and retained child snapshots                       |
| C     | codex/release-toolbox  | 47177e35dc2d8ddc872fc68288f7ee57f5ce9312 | T15 optional COS deployment-template defaults                                 |

C published `e23de5b447e91ac26e6368e3d32098608882abc8` on
`codex/release-template-cos-default-20261025` after the original branch push was
rejected because remote `f9145e1` was ahead. No force push was used. The
controller imported code checkpoint `7c3da27` as `ae70a93`; a fresh Git comparison
confirmed the template and test are identical to C's final SHA. The old service,
blanket-grant script and incomplete package copier were not imported. The RC
already contains the safer controller and fail-closed legacy grant path.

B's existing authorized-home implementation `03614e2` was imported as
`f7e4a0d`. Only a task-record conflict occurred; both dated records were kept.
The imported UI and API adapter compiled together with payment/COS source.

## Verification and evidence boundaries

Controller checks so far: Node24.18.0, fresh locked `npm ci`, desktop16/16 unit
tests, workbench DOM1/1, desktop lint/typecheck/build, release7/7 and targeted
formatting. Workbench proof was strengthened to fail on browser console errors
and warnings as well as page errors, and rerun successfully. Existing two React
lint warnings, the bundle-size warning and npm audit findings were not changed.

Historical hosted quality PASS on `700387b` is run40135998938. It is baseline
evidence only, not acceptance of the current combined candidate. A/B final
source, independent review and fresh combined checks remain to be recorded.

## Packages and deployment boundary

Candidate Windows version is fixed to `0.1.2` for this integration; this does not
create a Git tag or GitHub Release. A built candidate must retain its exact
source SHA, installer/Runner/manifest versions and SHA-256. Linux packaging must
use the RC's complete snapshot builder, preserve the reviewed restricted-role
grant policy, all named migrations and external file manifest. No historical
Windows installer may stand in for the new application source.

## Open gates

- BLOCKER: final combined CI and exact-source package evidence until produced.
- BLOCKER: real Windows revoked-session re-login and two-client payment,
  reversal, restart and COS acceptance. The previous error8 is historical; this
  run has not reproduced it or bypassed secure credential storage.
- BLOCKER: installed Windows/Toolbox install, update, uninstall, repair and
  retained-data proof. Upstream update URL, launch-choice and third-party apply
  discrepancies require the contract approval already mandated by AGENTS.md.
- BLOCKER: original formal procurement, print/PDF/Excel, complete localization,
  backup/restore and final parent acceptance remain open.
- WARNING: A's conflict-discovery endpoint currently returns all history while
  the desktop rejects more than500 results; capacity follow-up stays within the
  existing task and is not silently declared accepted.
- DEFERRED: any next child beyond each agent's selected slice; no extra feature
  is introduced for orchestration.

Recovery checkpoint during execution: `E:/Honsen-build/rc/recovery.json`.
Final handoff must replace IN PROGRESS with actual results, list all retained
dirty paths and record both local/remote source SHAs and artifact hashes.
