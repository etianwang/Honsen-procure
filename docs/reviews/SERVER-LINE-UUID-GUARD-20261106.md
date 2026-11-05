# Purchase-order line UUID guard and fresh-target conflict consumption — 2026-11-06

This report records two bounded repairs and the actual frozen-package handoff. It does not combine old and new client/native candidates into a blanket PASS. Server package acceptance is independent of pending Windows/native/install/UAC/Toolbox gates.

## Server repair and exact package

Production repair `ebfcaf22585549e10dbe9767e31de14f016474f7` adds a small `PostgresSyncStore.pushEvent` guard. It reuses the existing exclusive purchase-order/catalog transaction lock, after authorization, event replay and version checks and before business writes. Declared line UUIDs are case-normalized; another order's ownership (including soft-deleted order history), same-order duplicate UUIDs and malformed declared UUIDs produce the existing retained conflict. Only the current target payload is returned; the occupying order/project/payload is never returned. Same-order updates and normal globally unique producers remain supported. Existing legacy shapes without a declared line ID remain with their existing validators; this is not a claim that every arbitrary authenticated JSON payload satisfies the entire native DTO contract.

No PostgreSQL schema/migration, immutable snapshot, old malformed historical record, role policy, Toolbox identity/Runner contract or production COS contract was changed. The required five Toolbox sources were reread in order before code changes; this guard does not touch that contract. Original Toolbox/stable/UAC holds remain independent.

Actual validation:

- Focused PostgreSQL tests3/3PASS: concurrent different orders sharing a UUID yield one accepted/one retained conflict, case equivalence, exact replay, same-order updates, another unique producer, tombstone reservation, duplicate/malformed declared identities and no occupying-order payload leak.
- Full server suite with isolated PostgreSQL: **216PASS/3external opt-in SKIP**, strict typecheck/lint/build/format PASS. Those three live COS cases were separately actually executed in [the layered COS report](V1-FINAL-GATE-COS-20261106.md); they are not mislabeled as executed by this full-suite command.
- First fixture setup failed UUID/text parameter inference before tests; explicit UUID casts repaired the test setup. First full suite had4 fixture failures, subsequent targeted/formal runs exposed further preexisting clone fixtures reusing line IDs. New-order clones were given their own line UUIDs, while original QUOTE_UNAVAILABLE/formal-number/rate/security assertions remained unchanged. The final full suite passed. None of these failures was hidden by disabling the guard or changing immutable stored data.
- Committed real-package regression controller `tests/deploy/package-line-guard-http.mjs` was handed to C, together with the complete producer fixture whose order/line identities are unique before first submission. C independently ran it against its fresh extracted package and limited API role: concurrent1accepted/1conflict, case equivalence, replay, own-order updates, tombstone reservation and no occupying payload leak PASS. See [C's package evidence](SERVER-V1-PACKAGE-ACCEPTANCE.md).

Final server artifact source is **`332ef3d71d4279509d2522dd3f86c615a81bf0de`**, containing this guard. It is not the older03c package. ZIP:

`H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-332ef3d71d4279509d2522dd3f86c615a81bf0de.zip`

Size3499589bytes; SHA256 **`276bf757f48719ed85b0107f01831f11dfd4b29af67a90801eaa88a031aaec7a`**. C independently verified Ubuntu24.04/Node24.22.1/PostgreSQL16.15, migrations17/latest014, seed/defaults, restricted runtime grants/DDL refusal, admin password change, six business payloads, actual HTTP guard, Nginx retirement routing, restart and revocation. Root independently recomputed the Windows ZIP hash. C's result belongs to this exact package; it is not borrowed from03c.

## Actual native-fixture and package handoff

The original minimal server HTTP fixture lacked native DTO fields. It was not patched after formal issue or relabeled native-compatible. A new complete fixture was generated before first draft/approval, publishing reference data through existing authorized master-data and typed Sync Push paths. Its first real native attempt exposed reused global line UUIDs across draft/HPA/SPO; Rust correctly refused them. All accepted orders were regenerated in a fresh database with independent line UUIDs, constructor Set and per-event line-owner assertions. No old formal snapshot was rewritten. A temporary hypothesis about camel-case reference records was disproved by the existing production alias/version parser and withdrawn without changing the references.

For the new source3 fixture, the actual41-change pre-COS page was passed through production Rust projection before any COS write. It then used new prefix `honsen-procure-tests/ce6ae1c4-8029-4c47-a05a-669f9ed7b7dd/`, three owned PDF/HEIC/JPEG objects, actual byte backups, DELETE204/GET404/restoration and genuine pg_dump/pg_restore into `b_native_restored_v3_test`. Post-restore HTTPS API deep-equality of six business payloads and metadata/version(null)/bytes/hash for three objects passed. B's subsequent actual EXE execution owns native assertions; static DTO checks and these backend results do not substitute for them.

After C produced332, A independently extracted that ZIP into `/home/honsen-dev/a-native-server-332ef3d71d4279509d2522dd3f86c615a81bf0de`, verified all SHA256SUMS, preserved old03c API traces, stopped the old unique3443 API, and started **new332dist modules** against the same explicitly owned restored database/prefix. Strict HTTPS CAPTCHA200 passed before handoff. The test launcher uses the existing prefix constructor and Fastify-instance seam, with a process-scoped test CA; it is not an unmodified production-default-prefix/index startup claim. A legal query-only test hook forces Pull limit1 while preserving authentication, cursor/horizon, payload, response and lifecycle validators. Safe traces log only cursor/type/ID.

New332 `sync/postgres-store.js` hash: `0bbfacd980e7ea79750422b5917f67b180c82b5fdf37596ad015136245a8b786`. Actual332 COS/service/app/shared module hashes exactly match the tested03c versions:

- COS `f2cee5cc7dba35c36c20cdcca7107e72f4e9589994ae33bd5ca45a8a31d1a8c8`.
- Attachment service `e826adba171b479096c395e20b5ee94bce6355c2e8f12696c2e04f91bd099e77`.
- App routes `9f1603b603fba1b5dcc190a280db340f341448949babe52895f4e25f5c989fb0`.
- Actual bundled shared code `43071418ea7c131d8b0bdd14e1a81bb662c31bbf8c93f2f92b125f4e1410712a`.

New launcher hash `9b58e077be7d5ba0aec7411cdb869ae79d109815e54f1d6da12835504efafe0c`; safe handoff evidence `.cache/final-cos/final-332-native-proof/`. Current application-source/executable provenance and later real-native runs are recorded by B, not inferred from the old03c run.

The complete HTTP fixture's optional-null wire shape still caused a later native SPO close to receive a retained immutable conflict; original server history was preserved. It is not relabeled a successful lifecycle test and was not solved by server normalization or postissue rewriting. Root authorized a separate real-native producer market-close slice. That actual slice found a distinct client nonformal confirmed-to-executing/closed pagination bug; B owns its repair and final integrated gates. These limits are independent of the now-tested server UUID guard.

## Client fresh-target version-zero repair

Read-only interoperability review found the shared schema already permits `conflict.serverVersion=0`, but the client accepted only conflicts>=1, causing a refused fresh target to retry. Repair **`bd95eb2bf2db7a2904811c81a2b7520b976bf57e`** changes only that conflict threshold to>=0. Accepted acknowledgements still require>=1. Structured object payload and valid operation remain mandatory; owner/account/session fences are unchanged. A zero conflict is retained with both payloads and the original Outbox row, never marked acknowledged/synced; it stops automatic retries and duplicate replies do not duplicate the conflict.

Actual focused RED1FAIL/2PASS was preserved in `.cache/final-cos/conflict-zero-red.log`; after repair GREEN3/3PASS verifies payload/Outbox retention, no ack, no retry, replay-once, missing/negative versions, invalid/missing payload or operation, accepted-zero refusal and another account's inability to consume it. Focused formatting/type compilation, desktop strict typecheck/lint/unit30/build passed. Default Clippy passed with17 existing warnings. An additional nonmandatory `-D warnings` probe failed on unchanged existing style warnings; it was not counted as PASS or used to expand into unrelated cleanup.

A's full Rust lib result158PASS/7ignored occurred before B added its new market-lifecycle regression. The subsequently shared worktree contains B's known RED until its repair; this older full result is not represented as final integrated acceptance. B will own the merged full suite/build and new debug EXE; C must build the next Windows candidate after both client repairs. **Server332 ZIP is unchanged by this client-only repair and must not be rebuilt for it.**

Zero-target conflict resolution was not expanded: the existing purchase-order resolver requires a server draft payload, so an empty server target fails closed rather than automatically adopting/deleting local data. Administrator/manual recovery for that special shape is a deferred workflow, not an automatic UUID regeneration or silent conflict discard. No resolution/UI behavior was changed.

## Remaining boundaries and resource ownership

- No remaining blocker for bounded server guard checks and fresh-target acknowledgement retention; actual final Windows/native integrated acceptance remains pending B/C's current lifecycle repair, new EXE and candidate evidence.
- Original UAC, actual Toolbox qualified assets/caller and installed/authenticated-upgrade gates remain open; no stable production release or remote deployment occurred.
- A's earlier standalone object prefixes were cleaned and confirmed404. Current new prefix ce6... and `a-native-restored-api`3443 remain deliberately owned by A and retained for B's final new-ZIP/new-client run. The shared `honsen-final-gates` database remains in use by B. Private handoff has current-user-only ACL and is not committed. A must clean exact current owned keys/API/CA/private state only after B signals completion, then coordinate the single shared Compose cleanup owner; no old Sandbox or another agent's resources may be deleted.
