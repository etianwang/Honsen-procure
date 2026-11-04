# Authorized history XLSX export — 2026-11-04

Status: IMPLEMENTED; builder checks and normal-route DOM PASS. Native installed-client and Microsoft Excel visual acceptance remain open. Source is this report's containing implementation checkpoint; no earlier native SHA is substituted.

## Scope and boundaries

The existing history panel exports all authorized records matching the applied filter, following every cursor. It reads existing trusted list/detail/comment IPC; formally issued rows use the separately authorized `get_formal_print_document` allowlisted immutable projection. No database/schema/mutation, new privilege or Toolbox contract is introduced. Five upstream Toolbox sources were read in order and compared with the integration record: existing launch/apply/live stable gaps remain outside this export slice; no identity, installer, Manifest or Runner change.

The file is explicitly an internal reconciliation export, containing comments and audit metadata. It is not an owner-facing external order document. Raw audit previous/next payloads, attachment binary and internal owner pricing fields are excluded. Formal null notes stay null rather than falling back to mutable notes. Filter is captured once; repeated entity/cursor, denied read, malformed formal projection or list/detail amount/status drift aborts before creating download bytes. This is not a database-wide transactional export; independent changes beyond the read consistency checks remain a limitation.

Sheets contain orders, lines, audit metadata, comments and formal terms (supplier, dates/address, subtotal, discounts, freight, tax). Export language is explicitly selected as Chinese, French or English, with one header catalog per file. Formal material names preserve the supported frozen Chinese/French pair. Workflow statuses are localized; unknown statuses reject instead of leaking an untranslated key. Audit action identifiers remain factual historical identifiers. Unix-second audit/comment timestamps convert to ISO dates after validation. Money stays exact decimal text plus raw minor-unit text, including values beyond Excel's 15-digit numeric precision. No floating-point financial calculation or aggregate cross-currency total is performed.

## Dependency and security review

Exact `exceljs@4.4.0` was approved after checking its official `exceljs/exceljs` MIT repository and npm registry identity/version. The official registry transfer failed ECONNRESET; the allowed HTTPS npmmirror retry succeeded with integrity checks and scripts disabled. No global environment installation or audit-fix occurred. The dependency is lazy loaded only on export. Production uses a new workbook, explicit string values, and XLSX `writeBuffer`; it uses no CSV, formula object, imported file, image, arbitrary filesystem path or workbook-read API. Workbook read APIs appear only in tests.

Audit is **not clean**. `.cache/excel-dependency-audit.json` records 12 production advisories: one high, ten moderate, one low. ExcelJS reports moderate transitive archiver/glob/minimatch and uuid chains; this browser-only in-memory XLSX generation does not invoke filesystem globbing or caller-supplied uuid buffers. The approved CSV injection advisory boundary is avoided by excluding CSV and formula objects; formula-shaped strings are checked by XLSX round-trip tests. These are reachability limits, not claims that the dependencies are patched. The pre-existing high Zod constrained-collection advisory is controller-owned for a separate patch; no unrelated dependency upgrade is included here. Several transitive dependencies emit deprecation notices.

## Executed evidence

- Desktop strict typecheck, lint and production build PASS. Existing React-effect and chunk-size warnings remain; ExcelJS is a separate lazy chunk.
- Full desktop unit suite PASS23/23, including five new workbook tests: exact huge money, Unicode, formula-shaped strings, trusted frozen projection, French headers, permission failure, repeated pages/concurrent change rejection and actual2026 Unix-second conversion.
- `history-excel.spec.ts` PASS1/1: production history component control creates an actual XLSX download, is reopened and checked, and a later denied read shows an error without a second partial download. This independent component mount is supplemental DOM evidence.
- `navigation.spec.ts --grep 'authenticated desktop switches'` PASS1/1: ordinary offline login → shell authorization scope → procurement request/history → approved/issued owner record → filter → Excel download → readback confirms official number, exact1200XOF and French material. It retains existing preview/copy/withdraw checks. IPC is mocked for browser presentation; this does not replace native authorization acceptance.
- Targeted formatting and `git diff --check` PASS.

Actual safe synthetic normal-route download:

` .cache/excel-evidence-20261104/206c3ab7-e2ee-417a-bcad-dd0bee4c43e2/normal-history-formal.xlsx`

The browser downloaded and ExcelJS reopened that ZIP-based XLSX. The original test-results artifact was removed by a later parallel Playwright run before desktop inspection, so it did not establish visual acceptance. The normal-route test now saves each download and screenshot into a new random-UUID directory under the ignored .cache/excel-evidence-20261104, outside shared Playwright cleanup. The target was rerun PASS1/1 with isolated output .cache/excel-playwright-isolated; the retained workbook and normal-history-export.png exist at the path above. Microsoft Excel desktop visual opening, printed pagination/long-name layout, and installed EXE export have not been verified. No physical printer result is claimed. The first supplemental test failed because React's Vite module exposed `createElement` under default; its fixture import was corrected. The first normal-route extension timed out after successful export because applying the filter legitimately cleared the prior detail; reopening the existing detail restored the original copy assertions. Neither failure changed product acceptance expectations.

No production data, COS object, main branch, PR merge, Release or deployment was touched. Controller owns checkpoint and Push. Remaining BLOCKER for full T12: installed native export and visual workbook acceptance, complete approved document-language/localization scope and original parent gates. This bounded XLSX implementation does not close them.

## Retained stress workbook

An ignored local generator loaded the production `buildHistoryWorkbook` module through Vite in a real Chromium browser, then wrote and reopened a second synthetic workbook. It has85 long Chinese/French lines, exact large cent values stored as text, BigInt-consistent line/subtotal/freight/tax/total fixture values,2026 audit timestamps and formula-shaped comment text. Readback checks85lines, exact raw total and actual2026 date PASS. It is not an installed native export or desktop visual PASS.

File: `.cache/excel-evidence-20261104/stress-fef518c8-59b7-4a9c-9c4f-53bac772b040/synthetic-stress-85-lines.xlsx`.

SHA-256: `d23d0d5153cfa46ab5a299aa5314dfa2fbb93b09de05104a7756d8272a7f0d15`.

Generation HEAD: `7edc434ea199ee2d172ea441ef596604ff42734f`; comparison against candidate2812631 showed no changes to `history-excel.ts` or `formal-print-api.ts`. The ignored `generate.mts` and `evidence.json` alongside the workbook preserve reproduction and exact hash. Generator initially encountered Node/CJS top-level-await and ExcelJS Node dynamic-export incompatibilities; generation was moved to the supported production browser runtime, with a test-only esbuild naming helper supplied to its evaluated fixture. No production code or dependency was changed. The controller owns actual WPS opening/pagination/long-name visual verification. The owned Vite5189 process was stopped afterward.
