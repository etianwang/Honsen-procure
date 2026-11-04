# Native boundary diagnosis — 2026-11-04, round 2

The new debug-only diagnostic separates Rust environment receipt from Loader behavior. Controller run 725e4dd reported all three environment-presence/expected-port booleans true with config experiment false, while environment-only CDP failed. Thus host-to-Rust environment loss is disproved for that run.

The controller checked Microsoft's documented elevated-host behavior: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags . Elevated WebView2 hosts ignore environment overrides; API configuration remains the supported route. This matches the elevated host, actual Rust booleans and successful API-mode experiment. No policy was weakened.

API-mode run .cache/native-20261104014716 reported SHA6180df3e8498c40ee188772fa9b36bcff3894538. It passed two native EXE/CDP launches, real online login, draft Push, second-device Pull/approval/market transition and receipts, then failed record_procurement_expenditure with forbidden after switching device A to purchaser-b. This is progress evidence, not full acceptance.

Read-only inspection of that run's a.test.sqlite found authorization snapshots for synthetic accounts011/012/013, but none for purchaser-b014. Server fixture gives014 purchaser/administrator roles and driver seeds its cloud project/scope bindings. The driver switched accounts then attempted a write without refreshing authorization. Trusted record_procurement_expenditure correctly requires the current actor's exact live project/department/team snapshot through require_active_scope_for_order / require_order_write_scope. No permission guard should be weakened.

Minimal fixture repair: after purchaser-b online login call the existing refresh_authorization IPC, which loads its cloud-authoritative scope through HTTPS; assert the resulting exact014 scope exists by read-only SQLite query before payment. No direct snapshot insertion, business-code change, migration or permission bypass. node --check and Prettier passed. Actual post-fix chain is pending controller execution on the committed candidate; previous failed evidence remains intact.

The debug-only API mode is absent from release, requires isolated test profiles and an allowlisted loopback port, and records only boolean diagnostics. It is a test control, not a production remote-debugging feature. COS credentials never enter the guest/native child environment.
