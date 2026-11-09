# Suppliers and prices — desktop-first V1 integration

Starting source `532e945`, clean task branch `codex/suppliers-prices-20261106` after fetching origin/main. User requested independent supplier navigation and existing V1 supplier/quote functions, prioritizing a frozen deployed server.

## Contract and schema decision

Existing Supplier fields cover country, immutable business code, name, contact name, address/city/country, phone/WhatsApp/email, payment terms, delivery lead time, preferred/blacklist/active flags and version. Existing MaterialPrice covers material/supplier IDs, supported currency, integer minor-unit price, unit, effective date, source note and version. These writes reuse `save_supplier` / `add_material_price`, existing SQLite business/outbox transactions and unchanged Push/Pull payloads. No second supplier store is introduced.

The new desktop `list_supplier_prices` is a trusted, read-only IPC over the existing SQLite tables, scoped by account/project/supplier country and paginated in stable UUID order. It exposes locally retained active/inactive quote rows and their material/supplier names. It adds no HTTP endpoint, server field or migration. The ordinary catalog quote read remains unchanged. Supplied materials are derived from actual quote relations, not from the first four previews or a capped search result.

## Original requirement gap — supplier notes (not implemented)

`docs/SPECS.md:11` includes supplier `notes TEXT`. Existing `packages/shared/src/catalog.ts` Supplier schema has no notes; Zod object parsing strips unknown fields, and `apps/server/src/sync/catalog-payload.ts` canonicalizes parsed Supplier data. Sending notes would therefore silently omit them. The existing SQLite `0004_local_catalog.sql` supplier table and Rust Supplier DTO/read/write/outbox paths also lack this field. Quote `sourceNote` is already supported and is a different field; no substitution is made.

A future repair would require a backward-compatible optional nullable Supplier notes field, an additive SQLite migration, Rust DTO/read/write/projection/outbox and UI support, server/shared canonicalization preservation and old-client omission/conflict tests. PostgreSQL stores these business projections in JSON (`sync_entities.payload_json` and change-log payloads), not a dedicated suppliers table; no PostgreSQL notes-column migration is currently justified. This requires a reviewed server/shared update and is deliberately NOT implemented under the user's freeze. No existing migration or deployed database is altered.

## Deployment compatibility boundary

Server/shared/deployment application source remains unchanged by this task. The local latest delivered ZIP source observed during review is `0829780499a9b0ffe4bc490a9d4530e0416a24cb`, ZIP 3,537,677 bytes / SHA-256 `c9233b3e5a9a7222dd53cbab831877af2352ca264a1569e32091a59ee0018f12`, manifest latest migration `015_protected_admin.sql`. It differs from this checkout in account/protected-admin implementation. Compared with starting source `532e945`, the entire `packages/shared` and `apps/server/src/sync` trees have zero differences; specifically catalog schema, canonicalization, sync service and PostgreSQL store boundaries match. That scoped comparison must not be represented as a whole-server source match. The actual running server SHA is not established by a public endpoint. Real compatibility still requires authorized business Push/Pull evidence. The desktop-only supplier integration itself requires no server redeployment; implementing the supplier-notes gap would require a later reviewed server update.

## Current evidence and remaining boundaries

Public read-only probes: CAPTCHA 200; `/api/accounts?username=Zhanghekai` 404; unauthenticated authorization context 500. These are reachability/route observations, not successful authentication or business authorization. No password was read, logged or guessed; no remote configuration/database write occurred.

Real remote multi-client acceptance needs two different enabled business accounts with exact project/department/team scopes. The governance-only bootstrap super administrator cannot be silently upgraded or used to bypass business authority. The existing local native drivers contain disposable-PG fixture writes and cannot be pointed at Staging. No simulated acknowledgement or direct SQLite mutation will be counted as remote business success.

## Completed functionality versus existing backend reuse

- Supplier list/search, new/edit, all existing contact/address/communication/terms/lead-time/status/preferred/blacklist fields are independently reachable from normal navigation.
- Supplier material and quote relations come from the new desktop read IPC over existing storage; quote history is 25-row UUID pagination including retained inactive records. This is not an external transaction archive or proof that remote history has all been pulled.
- Material comparison reads all active quote pages, rejects repeated/non-progressing pages rather than displaying partial results, groups by currency and unit, and sorts nonnegative integer minor units with BigInt. All six already-supported currencies are selectable (XOF, XAF, CNY, USD, EUR, ETB), with no new server currency contract.
- Supplier and quote forms/payload construction are shared with MaterialsPage. Cancel/reopen field contamination in the old supplier and quote editors was fixed and covered, without reimplementing material storage.
- Existing write IPC, authorization, SQLite mutations/outbox, push/pull and immutable business-code/history behavior are reused. The new independent screen is UI integration, not a newly implemented supplier backend. New persisted data fields: none.
- Pure super-administrator context guidance separates read scope from maintenance roles. Actual additive purchaser/administrator roles can enable existing UI editing; no role is automatically granted. Local-read failures and connection/sync failure are no longer automatically labelled missing project authorization.

## Local evidence

- Desktop typecheck/lint/unit30/production build passed; original effect/chunk/advisory warnings retained.
- Independent supplier DOM8 passed: normal navigation, history pagination and inactive records, complete-page grouped comparison, greater-than-2^53 exact XAF minor strings, three-language read-only, pure-super/additive-role guidance and storage-error classification. Existing material/supplier/catalog regressions8 passed. DOM uses mocked IPC, not remote sessions.
- Full Rust lib167 passed / 7 existing ignored; fmt passed. New supplier-history tests2 include trusted producer saves, actual file SQLite close/reopen with the retained isolated vault and real local CAPTCHA offline login, identical quotes/outbox, pagination31=25+6, inactive material/supplier records and country/project/session/expiry/disabled/first-login refusal.
- The optional extra Clippy `-D warnings` run failed 37 diagnostics; the ordinary all-targets check also found an unchecked read-length in an existing password-test socket fixture. A minimal test-only byte-count assertion fixed that real quality failure. Final fmt, password-fixture5 and ordinary `cargo clippy --all-targets` passed (36 retained warnings). The full167/7ignored run predates only this test-fixture assertion; production source did not change afterward, and the changed fixture was directly rerun. No production authorization or protocol was relaxed.
- Materials cancel/new-supplier and cancel/reopen-quote contamination regression1 passed; initial Cancel locator failure was retained/corrected without product relaxation. Final visual target2 passed and screenshots from normal App navigation, quote entry and comparison/history were inspected. Early test dynamic-import/ASI, fixture unique-index/vault/expiry assumptions and Spin deprecation failures remain preserved in ignored local logs; none were counted PASS. Existing data and all source-code backend contracts were preserved.

## Acceptance status

Real Staging Push/Pull and second-client readback: NOT RUN / BLOCKED by missing usable distinct scoped business sessions, not replaced by SQL seeding or simulated acknowledgements. A request for the user to identify existing business test accounts is pending; passwords are only entered by the user in the normal client UI. No authentication guesses or role escalation were attempted.

Bounded local supplier/quote functionality can be reviewed in the candidate, but full remote compatibility and Alpha internal distribution readiness are not accepted. Supplier notes remain an explicit original-spec gap requiring a later reviewed contract change. Candidate packaging does not close original installation/data-retention/security/Formal/Toolbox/release gates.

## Windows Alpha candidate

- Frozen application source: `d9d00958b5f0daf765119506c42072af719fe153`, pushed on `codex/suppliers-prices-20261106`.
- Existing release script produced a real x64 NSIS installer, numeric `0.1.17` (no existing local Setup of that version was reused). Directory `.cache/alpha-candidate-d9d00958/` explicitly marks this as an Alpha candidate. No identity, numeric Manifest schema, public Runner protocol or canonical stable update source was changed.
- `Honsen-Procure-0.1.17-Setup.exe`: 7,490,158 bytes; SHA-256 `0442cd4a5525d6bc5f22d719d910d65253a70dadefb10f55abe4c6c1122989ce`.
- Main SHA-256 `9d2f7e98b93e1968da8deb9f14d4c5845406ddfe2cc532d8d156f48963334d8f`; Runner SHA-256 `c0a3f2f0307a9189f34c954a497ac91433194354bcb73a7b608e4a68d83cba21`. Installer, main, Runner PE and Manifest versions were all independently read as `0.1.17`.
- Candidate includes `SHA256SUMS` and `ALPHA-CANDIDATE-NOTES.md`. Main Release defaults to `https://api-pr.honsen.africa/v1`, with no isolated override feature. Limited binary pattern scans found no private-key, COS access-key-ID or PostgreSQL credential-URL patterns; this is scoped evidence, not an assertion of arbitrary-secret detection. No passwords are included in the candidate notes.
- Fresh installation, installed online login, upgrade/uninstall preservation, remote two-client sync and real Toolbox update: NOT RUN. Existing policy/authorization constraints and separate account prerequisites were not bypassed. No Setup execution, deployment, GitHub Release or stable publication occurred.
- CI run [42160742682](https://github.com/etianwang/Honsen-procure/actions/runs/42160742682) was still in progress at the final check; CI PASS is not claimed. Local checks above remain separate evidence.

Final decision: **ALPHA_INTERNAL_TEST_BLOCKED**. This is a reviewable installer candidate, not approval to distribute it to company testers.

Next safe action: obtain two existing scoped business sessions through user-entered normal client login, run real supplier/quote Push/Pull and second-client/restart readback, then run installed/data-retention acceptance. If no such accounts exist, report the account-provisioning prerequisite; do not change server authorization or seed remote tables. Supplier notes await a separate reviewed compatibility decision. A potential pre-existing material-editor cancel/new draft-reset issue outside the supplier/quote controls was noted but not independently reproduced; record it as a nonblocking follow-up, not a new release acceptance claim.
