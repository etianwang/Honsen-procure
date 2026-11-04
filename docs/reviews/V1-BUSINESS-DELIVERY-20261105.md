> 2026-11-05 current environment correction: historical WSL HCS BLOCKED_ENV is resolved. WSL2, normal-user Docker and PostgreSQL16 are freshly working. Business results are evaluated separately at854186c; see [restored acceptance](V1-RESTORED-ACCEPTANCE-20261105.md). The historical source-bound failures below remain preserved.

# V1 business delivery — 2026-11-05

Application source: `c08ac9ddc0cfe3eeabe7ed464d0c10c034172360`, branch `codex/v1-resume-20261104`. Earlier installation/update work is preserved. User authorized development, tests, commits and pushes, but not main changes, merge, Release or production deployment.

## Delivered scope

- Existing SPO implementation was inspected instead of rebuilt: trusted supplier-child issue, independent formal namespace, immutable snapshots, audit/outbox and server registration remain in place. Fresh baseline server SPO test 1/1 and Rust SPO tests 2/2 passed. No migration or sync contract changed.
- Frozen `zh_en` documents now select the English name from the signed snapshot; missing selected translations fail closed. OPA/HPA/SPO use the existing read-only allowlisted projection. UI locale remains independent of the frozen document language. Excel chooses the corresponding frozen foreign-language name, with readback regression.
- Print CSS adds page header and page counters. Actual native multi-page evidence is recorded separately; CSS and headless evidence alone are not native acceptance.
- Three-language coverage expanded to login, online authorization, catalog/material/supplier/quote maintenance, image cropper, supplier allocation, receiving, approval policy, sync conflicts, category repair, master data, project defaults, tax templates and exchange rates. Existing shell/home/requisition/execution/history/payment/reversal/attachment/workflow catalogs remain in use. Language changes use the existing persistent locale store and preserve form state. No parallel locale state system was introduced.

## Fresh checks

- Repository Prettier, workspace strict TypeScript and lint: PASS; two existing React effect warnings retained.
- Desktop unit tests: 28/28 PASS. Desktop production build: PASS; existing large-chunk warning retained.
- Rust library: 145 PASS, 7 existing ignored external cases. Explicit English frozen projection/missing-translation test: 1/1 PASS. Cargo formatting initially found two new test layout issues; formatted and final check PASS.
- Independent final-source focused DOM: 17/17 PASS, including French/English controls, draft retention, persistent locale, frozen bilingual preview, print cleanup/pagination, Excel download, HPA and SPO controls. Output: `.cache/v1-final-dom`.
- Earlier orchestrator DOM attempt was invalidated by concurrent runners sharing artifacts/server; it is not PASS. A subsequent serial run found one stale HPA raw-status expectation; commit `d2faa9a` corrected it without weakening formal-number/retry/amount assertions. Final-source rerun passed.
- Full final-source DOM and native long-document outcomes are appended after execution.

## Integration and limits

The five upstream Toolbox documents were read in the required order. No identity, manifest, Runner, installer, result or uninstall contract changed. Existing cross-repository Toolbox apply/caller and launch-argument gaps remain outside this business change; no conflicting implementation was changed.

- BLOCKER: Current WSL2 fails before Linux starts with `Wsl/Service/CreateInstance/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED`. Both minimal `true` and Docker preflight fail. Therefore the prescribed disposable PostgreSQL and actual HTTPS two-client payment/reversal/COS/HPA/SPO chain cannot run in this environment. Raw evidence: `.cache/v1-native-wsl-blocker.log`. No system policy was disabled, no environment reinstall attempted and no historical PASS relabeled. COS credentials were not read because this prerequisite failed.
- BLOCKER: Existing OPA nonzero line/order discount or freight prints fail closed; their final-price derivation remains unfinished. Complete T12 cannot close.
- BLOCKER: Original installed security, immutable revision/closed-history permission matrix, authenticated native/object-byte recovery, complete final language/print acceptance and Toolbox joint release gates remain open. These changes do not close T08/T10/T12/T13/T14/T15 or any milestone.
- DEFERRED: Production deployment, main merge and formal Release remain unauthorized.
- WARNING: Existing fixed shell avatar is a placeholder; dependency/chunk/effect warnings remain. No data/schema migration, credential persistence, business authorization or production data was changed.

## Final execution results

Full DOM on the frozen application: 62 PASS / 3 FAIL; all three failures were stale localized-label expectations (tax edit labels, Chinese modal Close and French login preview after persisted locale). Only test selectors changed, retaining business assertions; focused recheck 3/3 PASS. No application source changed after c08ac9d. This is combined scoped evidence, not a claim that the original full run was green.

Actual matching c08ac9d Windows debug EXE produced a real 40-line SPO through business IPC. Native Microsoft Print To PDF produced four A4 pages (10/14/14/2 lines), 4000 XOF, repeated headings, Chinese/French fonts, HONSEN header and 1/4 through 4/4 page counts. [Exact source, binary/PDF hashes, images and limits](V1-BUSINESS-NATIVE-20261105.md). This is local offline print acceptance, not HTTPS synchronization or installed Release acceptance. English frozen projection has Rust and DOM coverage; actual native English/OPA/HPA print combinations remain final acceptance gaps.

Final evidence-only/test-selector checkpoints preserve the c08ac9d application boundary: compare `git diff c08ac9d..HEAD -- apps packages` (empty). Final checkpoint is the containing commit; inspect git log for its full hash.
