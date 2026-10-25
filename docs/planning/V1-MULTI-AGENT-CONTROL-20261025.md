# V1 multi-agent RC control — 2026-10-25

Status: CANDIDATE BUILT AND CHECKED / RELEASE_BLOCKED. This is the existing T15 integration
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

| Owner | Final remote branch                         | Verified source SHA                      | Controller integration           |
| ----- | ------------------------------------------- | ---------------------------------------- | -------------------------------- |
| A     | codex/procurement-t09a                      | ca44150c966fe5c2041442f4d34f0c6ed7b2342c | 0d0c80d                          |
| B     | codex/v1-business-flow                      | 5915335cdb16d97861fa99a587c831b8e5070566 | 8bfa3d3                          |
| C     | codex/release-template-cos-default-20261025 | e23de5b447e91ac26e6368e3d32098608882abc8 | ae70a93, identical template/test |

All source pushes were verified. C independently signed off A's final12-file
and B's final3-file static boundaries after matching file hashes to those exact
SHAs. No unresolved P0/P1 was identified in the selected fixes. That signoff is
static, not C rerunning the builders' tests. The controller compared A's four
core files and B's panel/DOM against the source commits without differences and
reviewed the combined Rust diff. All original parent checkboxes are unchanged.

## Verification and evidence boundaries

Controller checks so far: Node24.18.0, fresh locked `npm ci`, desktop16/16 unit
tests, workbench DOM1/1, desktop lint/typecheck/build, release7/7 and targeted
formatting. Workbench proof was strengthened to fail on browser console errors
and warnings as well as page errors, and rerun successfully. Existing two React
lint warnings, the bundle-size warning and npm audit findings were not changed.

Historical hosted quality PASS on `700387b` is run40135998938. Intermediate
controller `ae70a93` run40189750393 and `f37ba5e` run40190364444 also passed. They
do not establish final combined-candidate acceptance.

Fresh independent controller checks on integrated application source `8bfa3d3`:
workspace formatting/lint/strict typecheck/build, Rust fmt/bins check, payment-conflict3/3,
supplier-allocation1/1 and Runner8/8 passed. The three allocation DOM proofs
passed on this combined source. Before B's Rust/panel-only import, the same
unchanged shared/server/home/payment boundaries passed shared25/25,
desktop16/16, API/service27/27, release7/7 and production home/payment/conflict
DOM3/3. Final exact-RC CI remains required. No package or native PASS is inferred.

Initial controller failures are retained: an old generated PDB caused LNK1207;
only that exact cache file was regenerated. A release-profile library-test
attempt then failed because existing tests depend on debug-only helpers. No
hook or production protection was changed; the standard debug-profile tests
above passed afterward. New compiler artifacts/cache remain on E:. Generated
desktop/API output and release resources are redirected to E: through local
ignored junctions; application sources and installed dependencies stay in the
owned worktree.

## Packages and deployment boundary

Frozen source and remote `codex/v1-release-candidate`:
`f4756afdb01ebac7b17ae9016d9ad56ab450fea5`. This reference stays fixed. The later
controller checkpoint records evidence only; it is not a different application
candidate. [Sanitized full delivery inventory](../reviews/V1-RC-20261025.json).

| Artifact                       | SHA-256                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| Honsen-Procure-0.1.2-Setup.exe | 23ac1e5cc35b2840e905a4078b2d333b9f0faa60bbe91c0cdd96116b63f78577 |
| candidate.tar.gz               | d456de3978312a8c1c5333b38264b2abbdb993984821e3c0690e4bd7ebbdeec3 |

Both files, release/app/external manifests, Runner/main EXEs, `.sha256` files,
`SHA256SUMS.txt` and `delivery-inventory.json` are under
`E:/Honsen-build/rc/artifacts/f4756afdb01ebac7b17ae9016d9ad56ab450fea5`.
Windows build succeeded on OS build26200; main file/product version and both
manifests are0.1.2, installer/manifest hashes agree. The generated NSIS script
contains main, Runner and app manifest resources. Installer is **NotSigned**;
no installation/update/uninstall/repair was executed. Runner8/8 is unit evidence,
not Toolbox joint acceptance. Existing auxiliary CLI binaries are listed in the
inventory rather than hidden from delivery.

[Exact-RC quality run40191375930](https://github.com/etianwang/Honsen-procure/actions/runs/40191375930)
passed: desktop16, server162, shared25, release7, restricted PostgreSQL grants,
real isolated Linux nginx/systemd/controller checks, API build/package and
browser45/45. Three opt-in real-COS tests were skipped because
`HONSEN_COS_LIVE` and authorized live credentials were not supplied: synthetic-PDF
transfer/hash/denied access, genuinely expired URL, and actual Rust HEIC/JPEG
pair archive/readback. Exact names/reasons/affected T09/T11 gates are in the
inventory; live COS/current native acceptance is not claimed.

Downloaded artifact12598102738 matches the frozen source. Local verification
checked archive SHA-256, detached `.git/HEAD`, safe member paths, API/controller
entries, all71 migration hashes against the source, and every30322 manifest
entry against actual tar contents without executing or extracting them. POSIX
ownership/protected-parent deployment verification remains an operator gate.

After the new native binaries existed, the controller ran the existing vault
probe with fresh task-unique test-profile identifiers. It failed with Windows
secure storage error8 on2026-10-25; no production configuration or existing
business credential was read/changed. The utility hash, time and exit status are
recorded in the inventory. This is a fresh secure-store failure, not a full
online-login/two-client attempt, and supersedes the earlier statement that only
historical credential-store evidence existed.

Candidate Windows version is fixed to `0.1.2` for this integration; this does not
create a Git tag or GitHub Release. A built candidate must retain its exact
source SHA, installer/Runner/manifest versions and SHA-256. Linux packaging must
use the RC's complete snapshot builder, preserve the reviewed restricted-role
grant policy, all named migrations and external file manifest. No historical
Windows installer may stand in for the new application source.

## Open gates

- Final combined CI and exact-source package/integrity evidence: PASS within the
  scope above; no original final gate is automatically closed.
- BLOCKER: real Windows revoked-session re-login and two-client payment,
  reversal, restart and COS acceptance. The fresh task-unique secure-store probe
  failed error8; the full chain was not run and credential protection was not bypassed.
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

Retained source dirt: A clean; B only the pre-existing
`apps/desktop/src/components/AppShell.tsx`; C retains `.gitignore`,
`deploy/linux/README.zh-CN.md`, `deploy/linux/honsen-procure.service`, and
`deploy/linux/test-release-package.sh`. No old dirty files were imported into RC.

Recovery checkpoint during execution: `E:/Honsen-build/rc/recovery.json`.
The frozen RC is `f4756af`; the containing final controller checkpoint records
only documentation/evidence beyond it. Main, other worktrees, stable Releases
and production were not modified. Next priority is the existing T14 secure-store
and Windows re-login/two-client gate on a working authorized Windows environment;
Toolbox contract repairs separately require the approval prescribed by AGENTS.md.
