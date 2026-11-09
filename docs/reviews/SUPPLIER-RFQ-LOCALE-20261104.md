# Supplier terms and RFQ locale slice — 2026-11-04

Status: bounded supplier-terms/RFQ localization PASS; complete T13 remains OPEN.

Both production panels consume the existing active UI locale. Explicit Chinese/English/French catalogs cover headings, fields, accessible names, validation, loading/read failures, saved/send/close results and failures, status labels, and price-free RFQ explanation. Dynamic success messages store a typed message key and values rather than a translated string, so an existing notice also changes language. Supplier/user-entered names, quantities, currency codes and formal document numbers are not translated or reformatted into invented data.

Business/API actions, UUID/number allocation, saved-state gating, adjustment and integer money handling remain unchanged. Switching language neither remounts the panels nor resets RFQ supplier/number, terms inputs, or saved state. The existing formal-preview child component is outside this slice and retains its separately tracked print-language boundary.

## Evidence

- Desktop unit26/26, strict typecheck, lint and production build PASS; existing effect/chunk advisories remain.
- `npx playwright test tests/e2e/navigation.spec.ts tests/e2e/spo-formal.spec.ts --grep 'purchaser reaches execution|SPO send retries' --workers=1`: PASS2/2. Normal shell→execution→RFQ→allocation→child terms workflow now switches English/French while preserving RFQ number, tax537 and saved notices. Existing SPO send-failure/retry proves terms remain and the trusted formal number displays. Browser console assertions pass.
- Relevant Prettier and diff checks PASS. An initial test-edit syntax error omitted a newline; corrected before executing the passing unchanged business assertions.

## Remaining

Receipt and allocation panels, other business pages and complete locale validation/error coverage remain original T13 work. Print/PDF and frozen English material-name absence remain original T12 boundaries. This frontend presentation slice does not replace exact-source native SPO, installed security or final QA evidence. No schema/migration, business/authorization/API behavior or production data changed.
