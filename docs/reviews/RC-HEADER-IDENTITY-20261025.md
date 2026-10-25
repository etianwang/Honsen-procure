# Login identity and country/project header repair

Selected confirmed UI defect (B), within existing T13/auth-context presentation.
Frozen RC `f4756afdb01ebac7b17ae9016d9ad56ab450fea5` remains unchanged. Work branch:
`codex/rc-login-context-display`, from evidence checkpoint `710edd7`.

## Contract and implementation

The actual local `AuthenticatedSession`, cloud `LoginAccount` and shared login
response expose `username`; none has `displayName`. The shell now receives that
real session field and derives its avatar from the first Unicode code point.
Administrator presentation is `审批管理员`; no role or authorization mapping
changes. Preview is explicitly labelled `界面预览`, never a fabricated person.
The two requested Chinese names exist only in synthetic regression responses,
not production UI or master data.

Existing trusted authorization reads return country ID and project name, but
previously omitted the country name. Both queries now LEFT JOIN the same
project's country primary key and add read-only `countryName`; all previous
WHERE/role/expiry/order/selection conditions and row membership are preserved.
Missing country metadata displays `国家名称未同步`, with no ID-to-name guess and
no privileged all-country listing call. No migration, business write, Outbox,
API grant or account edit occurs.

The current confirmed context supplies the country/project summary. Selection
still calls `select_authorization_context` and reads the trusted result; no
optimistic option grants access. Request generations invalidate pending loads
and selections at login/lock/refresh, preventing an old-account response from
replacing a new account's header. CSS wraps the header instead of hiding all
identity text at narrower widths.

## Verification

- Failing-first Playwright proof: both new header tests failed because the real
  shell lacked identity/context elements; then both passed. They cover the two
  supplied username/role cases, avatar, country/project switch, rejected tampered
  selection, account switch, late previous-account response and1024/760/480 widths.
- Four targeted production-route browser flows passed: those two regressions,
  existing authorization-context switching, and existing online binding
  management. The fixture checks browser errors/warnings; it is UI-boundary
  evidence, not real server authorization acceptance.
- The existing Rust `authorization_context_requires_a_current_scoped_snapshot`
  regression first failed with countryName Null. It now passes with names for
  two actual SQLite country/project rows, context selection, ungranted selection
  denial and expiry. Only this directly necessary context test was run. The
  first full-debug link took9m22s; its replacement uses a per-package debug-info
  override, with debug assertions and the test unchanged, and passed1/1. No
  production/test hook was weakened.
- Desktop unit16/16, lint, strict typecheck and production build pass. Existing
  two effect warnings and bundle-size advisory remain. No unrelated Rust,
  server/PostgreSQL, payment/COS or release suite was manually rerun.
- Agent C independently read all callers and both trusted queries, confirmed
  display-only scope and unchanged authorization, and found no P0/P1 in the
  selected repair. Final source-file hashes are bound after commit.

## Screenshot boundary and remaining work

Native screenshot preparation is ready in the existing clean Sandbox. After a
fresh EXE is built from the committed repair, it will sign into newly isolated
test profiles through real password/CAPTCHA controls using existing fixture
accounts (`purchaser`, `engineer-a`), without mock IPC or DOM alteration. It must
be labelled as a native test-account screenshot, never a production login by the
two named people. No production account/credentials are accessed or changed.
Actual native outcome and source/EXE hashes are appended before handoff.

BLOCKER for full V1: previously confirmed NSIS split-install and other protected
Toolbox gaps, real online/revocation/two-client/COS, original formal/print/
localization/backup/security acceptance. This bounded header fix closes none of
those gates. DEFERRED: other agents' separately authorized slices and integration
into the next candidate. WARNING: browser fixture evidence alone is not native
acceptance. The unrelated pending Toolbox proposal remains untracked and is
excluded from this UI checkpoint.
