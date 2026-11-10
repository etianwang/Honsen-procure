# Internal Alpha baseline handoff

## Source and acceptance

[PR #23](https://github.com/etianwang/Honsen-procure/pull/23) carries approved option C from `98fe1df029c720e978cd32be25ba09925658275e`. It groups the existing eight pages under six navigation entries and targets a 52 DIP header. Hosted [quality](https://github.com/etianwang/Honsen-procure/actions/runs/42757937554) passed before squash merge as `6a34a40b9a2c935820293702c0cc35d9bd8af95b`. The merged tree matched the PR head across all 53 changed files. [Shell implementation and scoped evidence](../design/ROLLOUT-20261109.md) describe the component changes.

Exact-head local verification passed Format, Lint, Typecheck, 233 workspace tests, 197 Rust library tests and 361 Windows Chromium cases in one run. The local workspace run skipped 144 PostgreSQL-dependent or opt-in cases. The hosted quality workflow runs its isolated PostgreSQL 16 service. Seven existing Rust native updater probes remain ignored.

The current Shell's Windows native interaction and physical DPI remain `BLOCKED_NATIVE_CONTROL`. Automatic approval rejected launching the isolated debug executable. The scope includes three languages, real Windows window sizes and 100%, 125% and 150% DPI. Keep these open independently of source merge and browser evidence.

The frozen unsigned x64 **0.1.24** installer was built from `794dd6e8c05cb010462c2692bb074af521f077be` and passed its bounded installed Staging smoke. Its SHA-256 is `EF49BDA348E56FA478138812EEA708B59DFBCD07F75B8AD8B883C39FBFF142A5`. The smoke used existing data, checked the dedicated test requisition and verified restart readback and sync. Detailed evidence stays in the restricted local record. The prior test package was held for a restricted distribution channel. Carry the original SHA and scope forward when citing the [incremental Alpha evidence](ALPHA-INCREMENTAL-20261109.md).

The frozen 0.1.27 x64 candidate has bounded `USER_ACCEPTED` evidence for
one installed HPA preview, PDF save and WPS reopen. See the
[0.1.27 review and evidence index](T12-HISTORICAL-HPA-ALPHA.md).
The remaining native scenarios and company-restricted distribution stay
open.

## Historical source audit

The inventory compared 88 distinct divergent local or remote tips by ancestry, touched paths and current content.

| History                               | Disposition                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #13 and #15–#18                       | The #13 head is an ancestor of the #21 integration head. #21 brought that tree and the later verified integrations onto `main` by squash. The original commit IDs can differ from the resulting main ancestry.                                                                                                                                       |
| #19 and #20                           | Keep the current implementations for immutable expenditure and conflict handling, quote selection, authorized queues and HPA. See the successor and scope comparisons in the [incremental review](ALPHA-INCREMENTAL-20261109.md).                                                                                                                    |
| #3                                    | CI trigger deduplication remains an independent workflow change.                                                                                                                                                                                                                                                                                     |
| #14 and `codex/t11a-security-fix1-qa` | Historical attachment-selection hardening targeted a renderer-supplied filesystem path. Current `import_attachment` accepts bounded bytes from the browser file input and does not accept a local source path. Keep the old draft for reference. Any remaining selection or reparse-point concern needs a reproduction against the current boundary. |
| Other historical refs                 | Older renderer layouts and migrations are superseded by #21 and subsequent fixes. Retain QA harness, evidence-only and archived WIP branches as reference. No verified missing Alpha production delta was identified for a replay.                                                                                                                   |

## Delivery gates

The first handoff PR run passed 360 of 361 browser cases. The sidebar test sampled its former width before the media-query listener updated the React render. The test now waits for the same exact width at each viewport. The application and acceptance dimensions are unchanged.

- Clone `main` from GitHub and use [the repository bootstrap](../../README.md#develop-from-a-fresh-clone). Record the tested commit and distinguish browser, unit, PostgreSQL and native scope. Existing ignored worktree evidence and credentials stay local.
- Build the next standalone Windows Alpha from verified `main` in a new output directory. Record version, exact source, checksum, signing status and the installed smoke state. Use existing Staging data and leave the 0.1.24 package intact. Distribute only after the new package passes its installed smoke and an authorized restricted channel is available.
- Toolbox catalog, stable update discovery, joint launch and Runner apply are Beta gates. The approved identity, packaging contract and original T15 final requirements remain in force. The upstream extra launch arguments and missing third-party apply call remain open. See the [Toolbox integration ledger](../HONSEN_TOOLBOX_INTEGRATION.md).
- Keep incomplete PDF and printing scenarios, mobile payment, and complete native UX and DPI checks in the Known Issues ledger. Preserve any confirmed authorization, data-integrity, financial or sync failure as an explicit blocker.
