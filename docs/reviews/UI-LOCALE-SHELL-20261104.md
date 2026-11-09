# UI locale shell slice — 2026-11-04

Status: PASS for the bounded shell slice only; complete T13 three-language acceptance remains OPEN. The tested code checkpoint is the subsequent implementation commit containing this report.

## Implemented

`ui-locale.ts` provides explicit Chinese/English/French messages and a shared reactive locale with local preference persistence. Storage failure does not discard the active route/draft. The top-bar language selector changes navigation, route heading, role, authorization labels, sync status/count labels and locale-specific sync timestamps. App-level Ant Design locale is selected consistently. No business role, permission, default session or data mutation changed. User-entered names/values are not automatically translated.

The locale store subscription rerenders existing components without route keys or replacement of the active form. The selection is global to the running application and survives reload through a non-sensitive UI-only local preference.

## Evidence

- Desktop typecheck, lint and production build PASS. Existing React effect and bundle-size advisories remain.
- `npm run test --workspace @honsen/desktop`: PASS 23/23 (includes the concurrently integrated Excel slice; not evidence that Excel native export passed).
- `npx playwright test tests/e2e/ui-locale.spec.ts tests/e2e/navigation.spec.ts --grep 'shell language persists|authenticated desktop switches|development sign-in placeholder' --workers=1`: PASS 3/3.
- New real application route case: normal preview login → purchase requisition → enter unsaved tax value 537 → switch English → switch French → assert unchanged active requisition and tax 537 → reload → confirm French persisted. No page errors. Existing navigation and authenticated context/history/preview regressions also pass.
- Relevant Prettier and diff checks PASS.

## Remaining boundary

This is shell localization and Ant Design locale integration, not complete business-page localization. Existing form field labels, validation/errors, child-order/payment/COS contents, print-language snapshots and missing English material translations are not claimed translated by this slice. Native installed-package locale acceptance is not run. PDF/print and Excel evidence remain separately tracked. T13 must remain unchecked until all required screens and state/error paths are translated and independently accepted.
