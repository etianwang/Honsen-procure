# Unified guard repair: actual ZIP and Windows candidate — 2026-11-06

Frozen artifact source: `332ef3d71d4279509d2522dd3f86c615a81bf0de`, including server line-identity repair `ebfcaf22585549e10dbe9767e31de14f016474f7` and client canonical owner-total paging repair `24a1287bb95225c80f3abf69d27ad271fb4b81c4`. This is a new package acceptance, not reuse of the old03c server or20eb Windows acceptance.

## Actual artifacts

| Artifact         | Actual path                                                                                                            |      Bytes | SHA-256                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------ |
| Server ZIP       | `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-332ef3d71d4279509d2522dd3f86c615a81bf0de.zip` |  3,499,589 | `276bf757f48719ed85b0107f01831f11dfd4b29af67a90801eaa88a031aaec7a` |
| Windows015 Setup | `H:\Honsen\Honsen-Procure\.cache\windows-final-candidate-332ef3d7\Honsen-Procure-0.1.15-Setup.exe`                     |  7,471,311 | `4f2a2bc90d9b749c5d315d4be0a474d05baa38a996900044bd8fe27af8c1b424` |
| Windows main EXE | same Windows candidate directory, `HonsenProcure.exe`                                                                  | 21,396,992 | `0cf714b455693b98c38309c683f65f210f94aefa52f6a9cb4306d34894ec666f` |
| Windows Runner   | same directory, `HonsenUpdateRunner.exe`                                                                               |  3,792,896 | `90c9f75d2a7ce4cfe412934d17da93915b4778298bb0c279d0e934759d4b553b` |

Old packages remain untouched. Windows015 is a local candidate, actually built with the existing mechanism and independently checked for PE versions015, canonical Manifest identity/update URL and matching SHA sidecar. It was not installed, launched against a real profile or published as stable. The final candidate metadata is `candidate-build.json`; build log `.cache/final-repack-controller/windows/build.log`. Cached compilation used the existing separate release target; no B debug executable was overwritten.

Server software version remains `0.0.0-development`; active API version `v1`, Base URL `https://api-pr.honsen.africa/v1`, target directory `/www/wwwroot/api-pr/v1/`. PostgreSQL migration set remains17/latest `014_master_data_currencies.sql`; the line ownership guard is API transaction logic, not a new schema migration. Client SQLite0062 remains separate.

## Fresh isolated actual ZIP acceptance

C created a separate Compose project `honsen-repack-pg16`, using the repository disposable Compose definition with only image pinned to `postgres:16.15`, loopback port54330, fresh database `c_repack_test`, and random test-only credentials. It did not stop B's keeper30366, old54329 cluster or strictHTTPS3443 fixture. All commands used the existing normal WSL user `honsen-dev`.

Actual archive was newly extracted to `/home/honsen-dev/c-repack-332ef3d71d4279509d2522dd3f86c615a81bf0de/unpacked`. Linux SHA256SUMS/module/ELF/argon2 real hash-and-verify/shared/pg load checks PASS. Independent archive scan PASS:2,589 entries; zero test/fixture entries; no secret filenames or embedded initial password. Actual manifest migration, three Seed-file and contract digests were recomputed against the bytes. Actual runtime: Ubuntu24.04, Node24.22.1 and PostgreSQL16.15.

Fresh actual migration and Seed PASS: runtime-supplied initial password,2 countries/3 projects/14 units/0 newly created sites, user-approved CI1800/CM1925 basis-point tax templates and3 project defaults. Initial authenticated Pull contains24 changes. Separate runtime role was created and granted from the actual package SQL; live restricted-role DDL refusal and non-owner attributes PASS.

Actual packaged HTTP PASS:

- CAPTCHA/login, anonymous rejection, rejected empty Push, Pull and relogin old-session401.
- Initial admin advisory-only password change, actual password change, old password401 and old session401.
- Six nonempty OPA/HPA/SPO/payment/reversal records; idempotent replay, immutable conflict handling, manual stamp retention and explicit cancellation, engineer project/payment denial.
- New line guard: concurrent cross-order UUID gives exactly1 accepted and1 conflict; case equivalence, retained-conflict replay, same-order edit, unique producer IDs, tombstone reservation and absence of occupying-order payload leakage.
- Real Nginx active `/v1` mapping, inactive and retired business POST410 upgrade refusal, and unchanged sync/audit counts across those rejected requests.
- Actual API restart followed by six-record field preservation, disabled-account401, revoked purchaser-role refusal and revoked engineer-project-binding refusal.

Controller source is separately pinned to test-only `8142d4ca2556260f298971594f67cb0f95df07df`, rather than mislabelling those later test changes as artifact source332. Copied business controller SHA-256 `d98eda8486db4913f95a1d7b9a3323153731ddc5aa34e88802af17bdd97ddd2b`. The guard script was already committed with the production repair. C used a new controller directory and fresh state; no old03c private URL or business-state fixture was reused.

Public raw results: `.cache/final-repack-controller/public-evidence/` contains bootstrap/admin/smoke/business/guard/manifest-NONOWNER/Nginx/restart/revocation logs and actual OS/Node/PostgreSQL versions. These are real package results, not unit-test substitutes. No failure was observed in this fresh C package sequence.

Client default-URL/accessor behavior was not changed by either selected repair. Desktop source between B's24a1287 full Rust155PASS baseline and332 package source is unchanged; its existing default/override/path/retired-status unit coverage is reusable only for that unchanged boundary, not installed015 behavior. The actual new Nginx mapping/refusal was separately executed above.

## Cleanup and ownership

After its package checks, C stopped and removed only `c-repack-api`, then ran its own Compose project `down --volumes`, exit0. Own PG container/network/project volumes are gone; Linux listeners3000/54330/18081 are absent. C keeper60182 exited0. Generated test env, owner/runtime URL files and private business-state were deleted; public proof and artifacts remain. B's old keeper/cluster/API and A's owned COS objects/restored fixture were deliberately untouched.

A/B own the subsequent new-ZIP-module plus restored native EXE combination. This report does not claim that pending native readback, attachment bytes or G1 chain passed; their exact hashes/scopes must be evaluated separately.

## Classified limits

BLOCKER: none identified in this bounded fresh ZIP regression and candidate build. Installed015, authenticated012→013 upgrade, real UAC cancellation and real Toolbox caller/apply retain their explicit environmental/approval gates from [C's installation ledger](INSTALL-TOOLBOX-UAC-FINAL-GATE-20261106.md); this build cannot close them.

DEFERRED: A/B's exact new native/restored combination, cross-repository caller/test-channel work after approval, remote upload/deployment and stable publication. No remote or production operation occurred.

WARNING: server216PASS/3live-COS opt-in SKIP is A's owning-source regression evidence, separate from this package acceptance; actual COS prefix/object results are owned by A. Existing npm/compile warnings remain. Full V1 readiness must not be inferred from this package result. Preserved old files are rollback candidates only; SQL and business/snapshot compatibility plus verified recovery remain prerequisites.
