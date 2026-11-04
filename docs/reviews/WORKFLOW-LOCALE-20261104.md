# Approval and internal comment localization — 2026-11-04

Status: bounded workflow-panel locale slice implemented and checked; full T13 remains OPEN. The tested source checkpoint is the subsequent implementation commit containing this report, not the earlier native-tested100011d source.

## Scope

Only `OrderWorkflowPanel`, its explicit zh/en/fr catalog and relevant DOM assertions change. Existing active locale controls headings, approval/rejection state, confirm/reject/comment actions, reason/comment labels, validation/results/errors, immutable revision-diff labels, empty values, list counts and internal pricing labels. Dynamic mention-count success notices retain their count as data and render in the selected language, including zero notifications.

Unsaved rejection reason and comment remain in existing component state across language changes. Stored comment content, reasons, material/supplier names and audit values are not automatically translated or rewritten. Existing trusted API calls, `canApprove` conditions, local transitions and callbacks remain unchanged; no schema, permission, synchronization or business calculation changes.

## Fresh verification

- Desktop unit27/27, strict typecheck, lint and production build PASS; existing effect/chunk advisories remain.
- Existing normal owner approval-rejection-resubmission and immutable-comment cases plus the actual authenticated shell/history workflow route PASS3/3. The main-route test now changes English/French with unsaved rejection reason/comment and asserts both values retained and correct localized confirmation controls.
- An initial inherited assertion required raw `draft` text; the now-localized visible state is `草稿`. The assertion was corrected to that actual user-facing state and passed; business outcomes are unchanged. Known states are explicitly translated instead of leaking machine codes.
- Relevant Prettier and diff checks PASS.

## Limits

This is frontend localization evidence; it does not replace native approval/security validation or close full-language product gates. Stored internal pricing markup JSON remains an audit value rather than a translated data rewrite. Other catalog/admin/receipt/allocation/login surfaces remain separately tracked. No Toolbox contract, native runtime or production environment changed. Required five-source Toolbox preflight was refreshed in order; existing integration gaps are outside this slice.

## Independent recheck correction

The reviewer found one remaining literal `最终价格：` in the internal pricing audit row. It now uses the existing explicit message key. The normal owner-pricing workflow fixture verifies `Final price:1038` and `Prix final :1038` and asserts the internal-pricing region no longer contains the Chinese label in English/French, then switches back and completes rejection/resubmission. Fresh targeted DOM1/1, strict typecheck and production build PASS after the correction. No financial value or audit record changed.
