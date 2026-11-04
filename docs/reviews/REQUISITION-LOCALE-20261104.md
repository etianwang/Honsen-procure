# Requisition editor localization — 2026-11-04

Status: bounded requisition-editor localization PASS; full product T13 remains OPEN.

## Implemented

The production requisition editor and owner-pricing subform use the existing active locale with explicit zh/en/fr messages for field labels, accessible names, quote-source choices, markup/rate inputs, readonly price labels, line actions, validation, save/submit/withdraw/copy failures and results, local workflow state, incomplete-pricing warnings and summary labels. Quote currency formatting now uses the active zh-CN/en-US/fr-FR locale. Explicit minor-unit input/summary values remain exact original data and the trusted calculation/API actions are unchanged.

Messages are stored as typed keys, so existing validation notices update language without clearing the draft. Locale switches do not change route keys, material identities, quotes, tax, markup, approval input or saved data. Material/supplier names remain their actual stored values; no English material names or missing frozen translations are invented. History and formal-print components retain their independent acceptance scopes.

## Evidence

- Desktop unit27/27, strict typecheck, lint and production build PASS. Existing React effect and bundle warnings remain.
- Existing actual owner quote-selection/save and authenticated history/scope tests PASS2/2, with default Chinese business selectors preserved.
- Updated `tests/e2e/ui-locale.spec.ts` PASS1/1: normal shell → requisition, tax537 → English/French translated field labels, submit incomplete form in English → same validation notice becomes French, unchanged tax537, persisted locale after reload; no page errors.
- The earlier shell test expected a Chinese accessible tax label even after choosing English. Its failure was recorded and the assertion updated to the actual translated English/French labels; input preservation expectations remain unchanged.
- Relevant Prettier and diff checks PASS.

## Unaccepted boundaries

The approval/comment subcomponent and other business/admin/catalog/login pages have separate incomplete localization boundaries. Missing English frozen material-name schema and complete print language pairs remain unresolved. No native executable/installed UI acceptance is claimed by these DOM tests. No migration, money-calculation, server/API/IPC, permission, production data or sync contract changed.
