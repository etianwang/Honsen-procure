# Recovery map for the 2026-10-13 development branch

Source branch: `codex/bethel-desktop-e2e` at `88b645e`. Its merge base with
`origin/main` was `45b7664`. The source branch is retained unchanged. Each row
below represents one of its 19 original commits exactly once. Stage branches
are rebuilt from the latest `main` after the preceding PR merges; no PR is
opened from the 19-commit source branch.

| Original  | Stage                          | Inspected diff and dependency                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `14dcb84` | 4                              | Adds authenticated receiver prop and child `ReceiptPanel` to the normal execution UI. Depends on existing T08 child-order UI, not AUTH; stage 1 excludes it.                                                                                                                                                                                                                                                              |
| `3870c7e` | 1                              | Clarifies cloud-authoritative scope and the separate 24-hour login/30-day snapshot rules in PRD/task docs. Precedes authorization schema.                                                                                                                                                                                                                                                                                 |
| `da9419f` | 1                              | Adds SQLite migration 0028 and registration for authorization snapshots. Required by later trusted context/cache work.                                                                                                                                                                                                                                                                                                    |
| `f075020` | 1                              | Adds trusted context read and removes fixed preview IDs from signed-in requisitions. Its incidental receipt JSX formatting and receiver prop depend on `14dcb84`; those hunks are excluded from stage 1 and stay with stage 4.                                                                                                                                                                                            |
| `d83b14c` | 1                              | Adds PostgreSQL migration 004, scoped authorization store/service and authenticated API routes. Required by later grant/revoke and desktop refresh.                                                                                                                                                                                                                                                                       |
| `9f93966` | 1                              | Makes order Push check cloud project authorization; depends on the new authorization store interface.                                                                                                                                                                                                                                                                                                                     |
| `bcaa4dc` | 1                              | Corrects malformed authorization-scope error reporting in that store.                                                                                                                                                                                                                                                                                                                                                     |
| `a914da4` | 1                              | Adds scoped authorization revocation, API and tests. Its historical memory entry describing the stage-4 receipt checkpoint is not replayed in stage 1.                                                                                                                                                                                                                                                                    |
| `5010082` | 1                              | Adds online desktop authorization management, local migrations 0029/0030, refresh/selection, trusted write guards and DOM/API/Rust tests. Depends on the stage-1 server/schema groundwork.                                                                                                                                                                                                                                |
| `fb56377` | 1                              | Adds isolated PostgreSQL authorization migration/transaction tests and removes fixed auth-test token collisions.                                                                                                                                                                                                                                                                                                          |
| `01a788f` | 2                              | Adds scoped requisition history list and cross-project execution-list read guard; uses stage-1 authorization context.                                                                                                                                                                                                                                                                                                     |
| `afbbf65` | 2                              | Adds bounded history detail/filter/copy/withdrawal and trusted scope checks; extends the preceding history UI/command.                                                                                                                                                                                                                                                                                                    |
| `2d21795` | 2                              | Reopens scoped history approval/comment workflow and adds submitted audit evidence.                                                                                                                                                                                                                                                                                                                                       |
| `0f35e46` | 2                              | Exposes pending applicant-only withdrawal in history and rechecks it at the trusted boundary.                                                                                                                                                                                                                                                                                                                             |
| `aadba28` | 3                              | Limits local supplier/quote reads to live account country/project grants; requires stage-1 snapshot rules.                                                                                                                                                                                                                                                                                                                |
| `4e6f2be` | 3                              | Limits server supplier/quote Pull to engineer country grants; adds isolated PostgreSQL regression.                                                                                                                                                                                                                                                                                                                        |
| `8210bee` | 2                              | Prevents existing requisition IDs being revised into a different applicant/scope/number; depends on stage-2 revision path, not stage-3 catalog filtering. Replay with stage 2 out of original time order.                                                                                                                                                                                                                 |
| `9666494` | 4                              | Adds SQLite migration 0031, Honsen market-parent execution and parent partial/final receipt in trusted Rust/UI/tests. Requires the receipt entry in `14dcb84`.                                                                                                                                                                                                                                                            |
| `88b645e` | 5 (one housekeeping line in 1) | Adds SQLite migration 0032 and append-only Honsen expenditure Push/UI/tests. Depends on stage-4 executable orders. Its `.prettierignore` rule for generated Tauri schemas is brought forward to stage 1 because that branch's format gate otherwise fails; the remaining expense diff belongs only to stage 5. Pull projection, voucher archival and conflict/authorization acceptance remain required before stage-5 PR. |

Stage counts: **9 + 5 + 2 + 2 + 1 = 19**. Stage 2 includes `8210bee` after
`0f35e46`; stage 3 then replays `aadba28` and `4e6f2be`. Stage 4 replays
`14dcb84` before `9666494`. At each PR gate, compare the candidate against
the source stage's intended code diff, review conflicts explicitly, and run
the affected package, DOM, Rust and isolated PostgreSQL checks. A checkpoint
PR does not mark T09, AUTH-1 native-desktop acceptance, or the whole PRD done.

Recovery progress: stage 1 merged as PR #9 at `0864d34`; stage 2 merged as
PR #10 at `b7f2c03`. The stage-2 replay of `8210bee` kept its Rust identity
guard/test but excluded the original commit's stage-3 supplier/Pull progress
paragraphs. Stage 3 starts from `b7f2c03` and replays exactly `aadba28` and
`4e6f2be` as `2205384` and `0bec77e`. The stage-3 code diff contains only
local supplier/quote read scoping and server supplier/price Pull scoping;
no stage-4 execution or stage-5 expenditure code is included.
Stage 3 merged as PR #11 at `f9f65c9`. Stage 4 starts there and replays
`14dcb84` and `9666494` as `f7ee767` and `c1128b8`. Their code diff is limited
to the receipt entry, workflow-state migration, market-direct execution,
parent receipts, and associated UI/tests. The stage-5 expense source commit
is still excluded.
Stage 4 merged as PR #12 at `5139cc8`. Stage 5 starts from that latest main
and replays source `88b645e` once as `265dfb4`; its `.prettierignore` line
was already brought forward in stage 1, so the replay contains the remaining
16 files. Stage 5 is not PR-ready: receipt/expenditure Pull reconstruction is
being completed, and durable voucher archival, transfer and conflict gates
remain mandatory.
Stage-5 local checkpoint `5c3e19d` adds receipt/expenditure Pull projection.
Subsequent unmerged work adds managed expenditure-voucher archival, scoped
presigned transfer and attachment Pull metadata, with focused SQLite,
PostgreSQL and DOM evidence. It is still not PR-ready: receipt-attachment
projection, real object-store integration, and offline conflict/recovery gates
remain open. The 19 original-source commit ownerships above are unchanged.
