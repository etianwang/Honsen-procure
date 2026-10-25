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
  selected repair. Its final unchanged-file hash confirmation binds application
  commit `6b2f5a6fac32a7c4fe4a63169b823b2d31331076`.
- That exact application commit is pushed. Hosted quality
  [run40195426400](https://github.com/etianwang/Honsen-procure/actions/runs/40195426400)
  passed, including47 browser tests. The existing three opt-in real-COS tests
  remain skipped; hosted success does not close native/production gates.
- A native unsigned0.1.3 EXE was built from that source with the existing Tauri
  CLI using `--no-bundle` and an external version-only configuration. File:
  `E:/Honsen-build/rc/header-identity-6b2f5a6/HonsenProcure.exe`; SHA-256:
  `a42539719c8cd4ac9b8fdddcd38e15d61a44c4cdd8667df7d851f0695a8ebabd`.
  This is a UI verification executable, not a new frozen RC or installer.

## Screenshot boundary and remaining work

The actual unsigned EXE above ran in the existing clean Windows Sandbox using
a newly isolated test profile and the existing packaged fixture utility.
Release WebView2 exposed no CDP listener, so the first capture attempt timed
out before login. The app itself remained responsive. That failed attempt and
the intermediate login screenshots are retained; none is called a home-screen
pass. Agent A then used guest-local foreground-PID-checked keyboard input and
GDI window screenshots, with no mock IPC, DOM alteration or added debug hook.

Normal password plus the displayed local arithmetic CAPTCHA successfully
signed in fixture `purchaser`. Root independently viewed
`E:/Honsen-build/agent-a/ui-identity-6b2f5a6/output/native-purchaser-home.png`:
the actual shell shows avatar `P`, `purchaser · 采购员`, and
`Synthetic test country / Synthetic OPA project` from its fixture master data.
These are native test-account screenshots, never production login by the two
named people. No production account/credentials were accessed or changed.
Root also independently viewed `native-purchaser-min1024.png` in that same
directory: measured native client size1024×700, header wraps without identity
or context overlap. The product's existing minimum width1024 is preserved;
480px evidence is the browser layout regression, not a native-window claim.

Actual lock returned to the login UI without the previous identity/header.
Second-account native capture is **BLOCKED_CAPTURE**: the guest UIA/SendKeys
focus route did not reliably populate engineer-a's form, and its one submission
returned invalid account/password/CAPTCHA. No second-account success or product
authentication defect is inferred; testing stopped rather than guessing input
or weakening login. Cross-account/cross-country display and late-response
protection passed the scoped browser regressions; native cross-account success
remains unverified. Both fixture accounts share the same country/project, so
there is no native cross-country claim either.

BLOCKER for full V1: previously confirmed NSIS split-install and other protected
Toolbox gaps, real online/revocation/two-client/COS, original formal/print/
localization/backup/security acceptance. This bounded header fix closes none of
those gates. DEFERRED: other agents' separately authorized slices and integration
into the next candidate. WARNING: browser fixture evidence alone is not native
acceptance. Native second-account capture remains incomplete as above. The
unrelated pending Toolbox proposal remains untracked and is
excluded from this UI checkpoint.
