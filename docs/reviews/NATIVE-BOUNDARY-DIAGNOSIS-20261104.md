# Native boundary diagnosis — 2026-11-04, round 2

The new debug-only diagnostic separates Rust environment receipt from Loader behavior. Controller run 725e4dd reported all three environment-presence/expected-port booleans true with config experiment false, while environment-only CDP failed. Thus host-to-Rust environment loss is disproved for that run.

The controller checked Microsoft's documented elevated-host behavior: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags . Elevated WebView2 hosts ignore environment overrides; API configuration remains the supported route. This matches the elevated host, actual Rust booleans and successful API-mode experiment. No policy was weakened.

API-mode run .cache/native-20261104014716 reported SHA6180df3e8498c40ee188772fa9b36bcff3894538. It passed two native EXE/CDP launches, real online login, draft Push, second-device Pull/approval/market transition and receipts, then failed record_procurement_expenditure with forbidden after switching device A to purchaser-b. This is progress evidence, not full acceptance.

Read-only inspection of that run's a.test.sqlite found authorization snapshots for synthetic accounts011/012/013, but none for purchaser-b014. Server fixture gives014 purchaser/administrator roles and driver seeds its cloud project/scope bindings. The driver switched accounts then attempted a write without refreshing authorization. Trusted record_procurement_expenditure correctly requires the current actor's exact live project/department/team snapshot through require_active_scope_for_order / require_order_write_scope. No permission guard should be weakened.

Minimal fixture repair: after purchaser-b online login call the existing refresh_authorization IPC, which loads its cloud-authoritative scope through HTTPS; assert the resulting exact014 scope exists by read-only SQLite query before payment. No direct snapshot insertion, business-code change, migration or permission bypass. node --check and Prettier passed. Actual post-fix chain is pending controller execution on the committed candidate; previous failed evidence remains intact.

The debug-only API mode is absent from release, requires isolated test profiles and an allowlisted loopback port, and records only boolean diagnostics. It is a test control, not a production remote-debugging feature. COS credentials never enter the guest/native child environment.

## Restart transport failure after successful financial actions

Run .cache/native-20261104015119, SHA c293a8636616762d5f5be1efb48c03ef814d1ce7, advanced through login/order (15 successful calls), receipt/payment (15), and competing reversal resolution (15 successful, no rejected call in that phase). It then failed connectOverCDP with ECONNRESET at the restart after the reconciliation UI checkpoint. Expected fault-injection denials in offline/reversal phases remain recorded in raw evidence, not erased.

Driver-only bounded repair: stop waits for native host exit (10-second maximum) and explicit TCP refusal of the old loopback debugging port (15-second maximum) before returning. Restart connection permits at most four five-second connection attempts, 250ms apart, only for transport ECONNRESET/ECONNREFUSED/socket-hang-up errors while the child remains alive. Other errors and all business IPC failures propagate immediately. No authorization or business behavior is changed. Syntax and formatting checks passed; real post-fix rerun pending controller scheduling after HPA releases shared services.

## HPA catalog-fixture dependency repair

Run .honsen-native-qa/native-smoke-20261104015457 reached real HPA issue, accepted Push, repeated Push with zero pending, second native client's Pull, complete formal wire/snapshot checks and equality of persisted two-device formal records. Its overall FAIL occurred later in the catalog-change immutability scenario, not at formal issue/Pull.

Server sync evidence explicitly rejected quote event0212d3c9-d7b5-461f-9212-a22a84862626 with validation_error/FORBIDDEN, HTTP200. A read-only query of controller-owned honsen-hpa-native-20261104-postgres-test-1 confirmed sync_entities contains supplier006 but no material005. PostgreSQL store requires both authoritative catalog references, so rejection is correct. Local seed material is not a cloud-published material.

Minimal HPA driver repair publishes the unchanged local seed material using save_material IPC and the existing Push helper before publishing supplier/creating the later quote. It copies only the synthetic catalog fields, changes no product guard or ACK expectation and performs no direct database write. node --check and Prettier passed; post-fix native rerun remains controller-owned and pending.

## Attachment owner fixture boundary after successful reconciliation

Run .cache/native-20261104020357 at846583d passed competing payment resolution with originalsPreserved=true, acknowledged=true, bothPaidMinor=250, then restarted successfully. Its payment PDF voucher completed import, COS sync, second-device Pull and equal byte/hash reads (42 bytes, SHA35267608f8f600b32184dcaeb9996429ee5596f8b50698cacb208432091f88cd). COS cleanup reported PASS for one owned object.

Next PNG import failed invalid_input. The PNG is a genuine browser screenshot, not fabricated magic bytes. Read-only device-A local_receipts query returned zero rows: the requested receipt owner was created on deviceB, whereas importerA lacked a local receipt projection. Attachment owner_exists correctly rejects missing local owner. No image/security validation should be relaxed.

Driver fixture adjustment: receipt photos originate on deviceB, which owns the real receipt; deviceA consumes them via actual Pull/read/hash comparison. Payment vouchers retain A-to-B direction. HEIC original/derivative checks follow the actual consumer. No receipt row is fabricated and no guard changes. Syntax/format checks passed; post-fix chain pending. Remote receipt projection and arbitrary-device receipt attachment creation remain a separate unaccepted capability; this fixture adjustment does not close that parent gap. HEIC requires explicitly supplying a real fixture; absent flag is NOT RUN, not PASS.
