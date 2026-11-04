# Home page three-language slice — 2026-11-04

Status: bounded Home page localization PASS; complete product localization remains OPEN. Exact source is the implementation commit containing this report.

## Changes

Home uses the existing persisted active locale. Explicit Chinese/English/French messages cover the heading, scoped-data explanation, actions, loading/error/empty states, metric labels, table headers, workflow statuses and amounts. User-entered project/site/document names remain unchanged. Unknown workflow states display a localized unknown-state message rather than a raw translation key.

Saved monetary values remain integer minor-unit strings. Display uses `Intl.NumberFormat.formatToParts` with BigInt integer units and exact original fractional digits; no Number money conversion occurs. XOF has zero minor digits, CNY/USD/EUR two. The amount heading now accurately describes formatted currency amounts rather than raw minor units. UI locales are zh-CN/en-US/fr-FR. Home has no date field; this slice does not invent one.

No query, scope authorization, workbench aggregation, navigation, persistence or schema behavior changed. Locale changes do not trigger another data load or rewrite records.

## Checks

- `npm run test --workspace @honsen/desktop`: PASS25/25, including new large-integer/currency precision and malformed-input cases.
- Desktop strict typecheck/lint/build: PASS, existing React effect/chunk advisories remain.
- `npx playwright test tests/e2e/home-locale.spec.ts --workers=1`: PASS1/1. Real login→Home with synthetic saved data; Chinese heading, English/French state and exact currency; read failure hides stale orders, French retry enters localized empty state; no page errors.
- Relevant Prettier and diff checks PASS.

## Open boundaries

Other business pages, field validation/error catalogs, English frozen material names, PDF language pairs and installed-native localization acceptance remain separate unclosed T12/T13 requirements. These DOM checks do not replace same-source native business/security acceptance. No main merge, Release, deployment or production-data operation occurred.
