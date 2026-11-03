# HPA native independent acceptance — 2026-11-04

Status: BLOCKED (baseline prerequisite); no native PASS claimed.

## Read-only baseline evidence

The controller authorized only a native HPA test extension on `codex/v1-resume-20261104`, with no business implementation port. At inspection this branch points to `f4756afdb01ebac7b17ae9016d9ad56ab450fea5`.

`rg -n 'issue_honsen_formal_order|hpa_issue_is|hpa_' apps/desktop/src-tauri/src apps/server/src/sync` returned no matches. `git merge-base --is-ancestor a2b73ae9 HEAD` returned exit 1. Therefore the selected RC does not contain the HPA issuer required by the proposed test.

The handover business branch `origin/codex/v1-business-flow` at `a2b73ae9ee348fb6540b64a797b3274a9cb71450` contains the HPA implementation and builder evidence. Controller freshly verified PR20 quality run 40195470167 as success; the historical quote CI failure is superseded and requires no duplicate repair.

## Proposed bounded test after prerequisite integration

Add `tests/native/hpa-formal-pull.mjs` and one dispatch mode in `tests/native/run-native-https-smoke.ps1`. Use real EXE IPC, account CAPTCHA/password login, two different test SQLite profiles and installation identities, loopback disposable PostgreSQL/HTTPS, and generated run-specific credentials. Create and approve a Honsen parent through trusted commands, issue HPA offline, Push to acknowledgement, Pull on the second installation, and compare formal number, installation sequence, frozen snapshot bytes and ordinary prices/tax/totals. Restart and repeat Pull to verify preservation and idempotency. Read SQLite only for evidence; never manufacture formal order events.

Existing `g2-formal-pull.mjs` covers OPA owner-pricing fields and reports a hardcoded historical SHA, so it cannot be relabelled as HPA proof. Any new HPA report must capture the actual tested source and executable hash.

## Changes and checks

Only this review record was added. No test runner, application code, schema, migration, dependency, installer, release, Toolbox contract, production data or credentials were changed. Toolbox preflight is not applicable to this documentation-only blocker record.

Native execution and focused HPA tests were skipped because the selected RC lacks their required command and tests. This blocks HPA native acceptance; historical builder/DOM/CI success cannot replace it. No repair attempt was made against the missing business prerequisite.

## Remaining issues

- BLOCKER: controller must explicitly select/integrate the HPA implementation baseline before the authorized test-only slice can proceed. No business port is authorized for this agent.
- DEFERRED: HPA native two-installation acceptance, OPA regression execution, formal printing/export and other original release gates remain open.
- WARNING: this document records source inspection only, not a runtime environment or business acceptance result.
