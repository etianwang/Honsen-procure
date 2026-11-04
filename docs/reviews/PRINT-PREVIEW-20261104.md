# Formal bilingual preview — 2026-11-04

Status: bounded preview implementation PASS; T12 remains OPEN. The source checkpoint is the subsequent code commit containing this report, not an earlier native-tested SHA.

## Implemented boundary

Trusted `get_formal_print_document` uses historical account/scope authorization, validates the complete persisted formal bundle against the frozen snapshot, and validates the formal number against registered country/project/installation values. Unissued orders and tampered current payloads are rejected. It does not mutate orders, outbox or schema.

A strict allowlisted projection excludes owner supplier/cost/rate/markup/manual-reference metadata. OPA uses final owner unit price and primary currency; SPO uses child currency. Supplier details are parsed and allowlisted. The renderer validates the response with a strict Zod schema and uses React text escaping and BigInt money formatting.

Normal history → detail and supplier-child terms expose the preview. It displays Chinese/French material names, model/specification, quantities, money, tax, discounts, freight, supplier, address, notes, expected delivery, self-approval and signature spaces. Missing frozen Chinese/French names reject preview. The project is identified by its frozen UUID/site: the model does not freeze the mutable project display name. No substitute current catalog name is used.

## Fresh executed checks

- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`: PASS 127/127. Existing file-SQLite SPO fixture now checks unissued rejection, issued number/currency/tax/French names and tampered header rejection. Existing owner fixture checks supplier null, sensitive field absence and primary-currency lines.
- `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`: PASS.
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --bins --tests --no-deps`: PASS with existing advisories.
- `npm run test --workspace @honsen/desktop`: PASS 18/18; focused exact-integer money tests PASS 2/2 again after moving shared API.
- Desktop lint, typecheck and production build: PASS. Existing React effect/Vite chunk advisories. Shared API extraction removes the new component-only-export warning; post-extraction typecheck and focused tests PASS.
- `npx playwright test tests/e2e/navigation.spec.ts --grep 'authenticated desktop switches' --workers=1`: PASS 1/1. Actual login/shell/scope selection/history/detail/issue/preview controls render the frozen French material without browser console errors.
- `npx playwright test tests/e2e/formal-print.spec.ts --workers=1`: PASS 1/1. Additional component test covers rejected read/retry, escaped supplier text and exact monetary output. It is supplemental, not a replacement for the actual route test. Two earlier fixture failures used the wrong named export for Vite's CommonJS ReactDOM bundle; corrected import passed unchanged assertions.
- Relevant Prettier and `git diff --check`: PASS.

Playwright screenshots/traces use the repository's ignored `test-results` output; build/cache paths remain on H:. Cargo target is `.cache/cargo-target`. No credentials or real supplier data are included in fixtures.

## Explicitly unaccepted

The system-print button invokes `window.print()` with A4/repeated-table-header print styles, but WebView2 native system printing and actual PDF creation/opening have NOT been verified. PDF pagination, virtual printing and physical printing remain OPEN. Excel and complete zh/en/fr UI are not implemented by this slice. `zh_en` is rejected because the frozen model does not contain English material names; no translation is invented. This report does not close T12/T13 or installed-release security/final QA gates.

## Independent recheck correction — owner final money

Independent review found a genuine P1 in the initial preview projection: owner pricing saves final unit-price fields without rewriting legacy source-price line/header totals. A new assertion against the real owner-pricing SQLite fixture first failed (`lineTotalMinor` was `0`, expected `1038`). The projection now derives owner-facing line totals from frozen `owner_final_unit_price_minor × quantity` with the existing checked integer/half-up rules, sums those derived totals and calculates frozen-basis-point tax. The fixture asserts both line totals `1038` and `105`, subtotal/total `1143`; focused regression passes after the correction. These are derived read-only presentation values, not modifications of historical order or frozen snapshot.

Non-zero owner line/order discount or freight cannot be reliably reconstructed into primary-currency final-price adjustment semantics from the current snapshot contract. Such owner documents now fail closed rather than printing source totals or guessing a conversion. The supported preview boundary is zero-adjustment owner documents (frozen tax remains supported); nonzero-adjustment owner printing remains OPEN. HPA/SPO totals retain the frozen stored amounts unchanged.
