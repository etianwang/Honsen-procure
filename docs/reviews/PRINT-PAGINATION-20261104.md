# Formal print pagination repair — 2026-11-04

Status: **PASS for the bounded native two-line A4 virtual-print defect repair** at `66c777e11fabeb446ed728200331eecea4cfd891`. Long native documents, physical printers, installed-package print and complete T12/T14 gates remain OPEN. Confirmed defect is mapped to original T12/T14; it is not an optimization or new document feature.

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

## Actual repaired native GREEN

Clean implementation source `66c777e11fabeb446ed728200331eecea4cfd891` was rebuilt and independently captured before any later installer build could overwrite dist. Native debug EXE remains `fde98259b5b31c2ffab97b40a104ffa6f3ef24490a172a80973feb956221d190` because Rust did not change; the repaired compiled frontend tree hash is **`24f679d73eed74a24ee23ac868ed84ac8730785cb30811aeddf3389cd83fd716`**, distinct from RED. Runtime `.cache/native-print-66c-54c705f2-55e1-4b04-a204-966e3d61d8e6` retains the exact EXE/helper/frontend manifest. New synthetic preparation run `native-smoke-20261104084850` used this fixed runtime, normal offline login and existing child preview; it did not modify old profiles or contact PostgreSQL/COS.

Root operated the real native application's existing print button and WebView2/system Microsoft Print To PDF dialog. The repaired two-line SPO preview showed **one A4 page**; root saved `.cache/native-print-66c777e-GREEN.pdf`, SHA256 **`c982f25119960fd4fa919b818c303f798469b02f59e09ad177de3f1ccd0045de`**. Root's pdfinfo and independent PDF page-object count agree on one page. Actual saved PDF was rendered/opened with Poppler as `.cache/native-print-66c777e-GREEN-page1.png`: heading starts at the top, both Chinese/French material names, model/specification, quantities,100+100=200XOF, terms and signatures are visible without clipping. This is actual native virtual-print evidence, not the supplemental headless PDF.

Root then printed again: real preview still one page, Cancel returned the normal print control. Subsequent read-only CDP inspection found printing body class false, direct body print portal count0, retained screen preview count1 and visible normal print control. `.honsen-native-qa/native-smoke-20261104084850-afterprint-readback.test.json` records that independent cleanup observation; it did not click or print anything. Ready/run identities, formal number, rendered-image hash and exact PDF metadata are in adjacent JSON.

Root released the hold; preparation raw `.honsen-native-qa/native-smoke-20261104084850-offline.test.json` records source/harness66c777e, hold handed back and fixture PASS with its explicitly non-PDF scope. The owned preview server/EXE exited via normal finally; final1420/9241 listener check returned none. Synthetic profiles, RED/GREEN PDF/renderings and runtime manifests remain retained. The actual PDF PASS comes from root's separate system-print observation and saved artifact, not the fixture result flag.

This closes the confirmed hidden-shell/absolute-layout defect for the actual tested two-line native document. It does not grant long-document header repetition, all language pairs, physical printer or installed Release-package acceptance. The old100 RED four-page PDF remains unchanged; a later evidence-only SHA is not substituted for repaired source66c777e.
