# Formal print pagination repair — 2026-11-04

Status: **BUILDER PASS; fixed-source native print acceptance NOT RUN**. Confirmed defect is mapped to original T12/T14; it is not an optimization or new document feature.

## Actual native RED

Root used the existing ordinary Windows Procure offline login/execution/child-preview flow and actual print button at source `100011d41383bac4a7533c388572b4ac65bb97ee`, exact debug EXE SHA256 `fde98259b5b31c2ffab97b40a104ffa6f3ef24490a172a80973feb956221d190`, with its independently captured compiled frontend. The synthetic two-line200XOF SPO produced **four A4 pages**, with excessive leading blank area and trailing header/footer-only pages. It was saved through the actual system Microsoft Print To PDF dialog, not WPS or headless Chromium.

RED artifact `.cache/native-print-100-RED.pdf`, SHA256 `93addb612ac1cbb9f933312b030b21bb255096ec6f2c2b1096c05fc9d420cc9e`. Root's pdfinfo inspection and independent PDF page-object count both report4 pages. Preparation raw `.honsen-native-qa/native-smoke-20261104083328-offline.test.json` says its synthetic preview fixture was prepared successfully; that **does not mean printing passed**. Root released the hold after preserving RED; owned EXE/preview processes exited, profiles and evidence remain unchanged.

Root also rendered/opened the actual saved PDF with Poppler: `.cache/native-print-100-RED-page1.png` visibly places the formal title about60% down page1, with only one line at the bottom and two trailing blank/header-footer pages. This is actual native PDF visual RED evidence, not a DOM estimate. Both original PDF and rendered image remain local.

Cause: global `visibility:hidden` preserved the entire application layout while the nested sheet used absolute positioning relative to an ancestor. Unrelated screen content still determined printed pagination. Multiple visible previews could also be selected by the old global sheet selector.

## Minimal implementation

`FormalPrintPreview.tsx` now renders the same allowlisted immutable document component for screen and print. Only the clicked document snapshot is placed in a direct body portal. Dedicated `FormalPrintPreview.css` hides other body-level content using display:none only while the print owner is active; the sheet flows normally, without absolute positioning or visibility-based layout retention. A4 portrait/margins, repeated table headings, row-break avoidance and text wrapping remain supported. The print title's first margin is reset to avoid margin collapse.

A single synchronous owner prevents two preview components printing together. Afterprint/cancellation, unmount while fonts are pending, and a thrown print call remove the portal/body class and release only their own owner; a different preview can then print. A dedicated unmount cleanup also covers an owner acquired before its print effect finishes. Trusted DTO/schema, frozen fields, authorization, financial calculation, IPC, database and dependency contracts are unchanged.

Required product/security/test documents and Toolbox sources were reread; the five upstream sources were read in required order and compared with HONSEN_TOOLBOX_INTEGRATION. This repair changes no Toolbox identity, Manifest, Runner, installer, result protocol or data boundary. Existing Toolbox gaps remain separate.

## Builder evidence and limits

- Direct regression `formal-print-pagination.spec.ts` PASS1/1: a4000px nested relative shell with two separate previews prints only the clicked document in a direct body portal, shell display:none, print origin y0; an actual headless PDF has exactly one page for the two-line fixture. It verifies competing preview rejection, afterprint cleanup, pending-font owner unmount, new instance printing, thrown print recovery and later printing. Console errors are empty.
- Existing formal-preview failure/retry/escaping DOM PASS1/1.
- Desktop unit27/27, strict typecheck, lint and production build PASS; existing effect/chunk warnings remain.
- Independent Agent C reviewed the diff and owner cleanup boundaries and found no P0/P1 within this repair.
- Targeted formatting and diff checks PASS.

The supplemental headless PDF path/hash is in adjacent JSON. Its page count is useful regression evidence, **not actual repaired native-print acceptance**. The first direct regression exposed a16.59px title margin collapse; resetting only the print title margin fixed it without relaxing the y0 expectation. A new committed application source and frontend must be built and exercised through the actual native print entry before RED closes. Old100 runtime, its saved RED PDF, and its earlier business results cannot be relabeled as repaired-source acceptance. Complete long-document/bilingual/native PDF and physical-printer gates remain open.

The test-only offline runner's explicit HoldForPrint option creates a new synthetic profile, pauses after its ordinary native preview for at most20minutes, and communicates via derived run-ID ready/release files. It does not press print or infer print success; root independently operates/observes the existing system dialog. No credentials are saved in ready files, old profiles are not modified, and no PostgreSQL/COS service is used for this fixture. Controller owns implementation Commit/Push and final candidate coordination.
