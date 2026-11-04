# Procurement execution locale wiring — 2026-11-04

Status: bounded execution-page locale slice PASS. Complete execution workflow/product translation remains OPEN.

The page uses explicit zh/en/fr messages for heading, explanation, order list/empty state, parent details, workflow states, market-purchase action/result/failure, supplier-load failure and accessible child sections. Stored messages remain keys so switching language also translates an already-visible result. Current locale is passed to existing payment and attachment component dictionaries as zh-CN/en-US/fr-FR. There is no duplicate translation layer, DOM text replacement or business-action change. Default Chinese action labels remain unchanged; previously raw status codes now have localized human-readable labels.

## Executed checks

- Desktop unit25/25, strict typecheck, lint and production build PASS; existing effect/chunk warnings remain.
- New `tests/e2e/execution-locale.spec.ts`: actual normal shell navigation to execution, synthetic persisted order, unsaved payee entry, English/French payment and attachment labels, return to Chinese with payee preserved; no page or console errors.
- Existing production payment record/reversal and attachment offline/reload DOM regressions PASS alongside new locale case (3/3).
- Relevant formatting and diff checks PASS.

## Boundaries

Receipt, RFQ, supplier allocation/child terms and formal print components have separate uncompleted localization scope. Payment/attachment dictionaries existed before this slice; this implementation wires their supported active locale and does not claim every dynamic business error/content is complete. No query, role, permission, API/IPC, schema, monetary persistence, synchronization or attachment processing changed. Installed native locale acceptance remains OPEN. This slice does not close T13 or transfer old native evidence to a new source SHA.
