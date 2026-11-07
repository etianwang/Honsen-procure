# Received remote baseline receipt — 2026-11-07

Decision: **direct Patch refused; full deployment candidate review required**. No remote commands, permissions, files, services or databases were changed during this verification.

## Evidence

The user executed the supplied read-only collector in their authenticated server terminal and returned its JSON. The receipt identifies source `6b18850ee2e426fb68ac138fef866c4e4c718954`, package latest migration `014_master_data_currencies.sql`. This latestMigration field identifies packaged SQL, **not the actual database migration ledger**, which has not been read.

The preserved original full ZIP has SHA256 `6e9f5db161b9a612f4e0314c735e7febad310b174a29714793203bd4f68ffff5`. Its actual Manifest digest `3e0fe47d9860ddbf9cd64b2d6bf6a836c1d0ecac6056e327feace7da6170059e` and SHA256SUMS digest `b380b3824b55470af4ea1426518a0a0c38519ef9696d0c13e06653158fd60baa` exactly match the user receipt. Source identification is therefore verified against the original artifact, not inferred from Git HEAD.

The receipt has2233 checksum entries,2232 successfully read and1 failing path `.env.example`. Since that path contributed no regular-file row, it is missing/unreadable/non-regular rather than a demonstrated content modification. No attempt was made to read the real.env.

Recomputing the original ZIP's canonical receipt excluding.env.example and setting each remaining file mode to0755 gives exactly `2cf2eaf14cb2abff862be97bf47f1f21ee615f119895edab92815b83bb2abfe3`, the received regularReceipt. Thus the2232 collected regular-file paths, sizes and SHA256 content match the original package, but their observed mode is uniformly0755. The original2232 entries comprise2216 files0644 and16 files0755. Strict artifact mode equality fails; do not bulk chmod merely to bypass the patch guard.

The receipt reports336 known parent directories and11 links; its parent digest matches the preserved layout. It also reports13 unknown entries, including `.htaccess`, the uploaded original ZIP and `start.mjs`. These are not authorized deletion targets. The original6b ZIP has no start.mjs or Baota-entry Manifest identity, so the live starter is a locally added entry whose content/hash has not yet been independently verified.

## Actual BASE to target boundary

The green-CI full candidate remains `930807729d2fe48f9a4beedf093c109b08eeaa3b`, ZIP SHA256 `adf46f5a0c109a87910957d98a6e1e47a2d08516c00bc7455dfc7d060a24bc4d`.

| Boundary               | Original6b                                                       | Target930                                                          |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Shared bundle SHA256   | 43071418ea7c131d8b0bdd14e1a81bb662c31bbf8c93f2f92b125f4e1410712a | 7229e6d9e231250b79e3ead9f96504eeb64b7d304a00278580b15f4882889c2e   |
| Server entry SHA256    | befd1e266133154d86708b0852bee74114cf075dcf9fea4faca35d16512607a9 | 22ac9f926abeee95e00a10a7417422d2a3735095c3b3cff75bf4c02d66970e66   |
| Packaged latest SQL    | 014                                                              | 016, with015_protected_admin.sql and016_account_identity.sql added |
| Managed start identity | absent from original package                                     | verified start.mjs / single existing Baota PM2 project             |

A changed shared digest is not proof of a breaking business contract. It does exceed the current conservative same-contract Patch boundary and needs explicit compatibility/full-upgrade review. The missing original entry identity and strict filesystem drift independently prevent direct Patch eligibility.

The actual original6b and target930 ZIPs were guard-extracted into an owned local Ubuntu temporary directory and passed to the real create command. It exited1 with `INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED`, created no Patch directory, and the owned temporary tree was removed. No check was disabled and no replacement6b-to930 Patch was fabricated. The earlier569-to930 ZIP remains only its isolated verified example, **not an installer for this server**.

## Safe next boundary

Use the existing full930 package as a candidate, preserving the current directory/env/start/unknown local files and verifying database/file backups first. Before any upgrade, inspect actual schema_migrations, database owner/runtime role, unique PM2 project and locally added start.mjs without publishing credentials. Review and test the6b-to930 upgrade, including the two ordered SQL additions if absent. Do not assume only016 is pending, repeat Seed, reset admin, delete unknown files, normalize permissions or automatically roll back a database. This receipt authorizes no automatic upgrade; the user's latest scope remains local delivery and read-only comparison.

COS object-transfer acceptance and original remote/native/Alpha gates remain open. See [Patch delivery report](SERVER-PATCH-DELIVERY-20261107.md) for the tested mechanism and prior exact artifact evidence.
