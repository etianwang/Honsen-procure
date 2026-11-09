# Uploaded running-directory archive — 2026-11-07

Disposition: original6b program identity confirmed; direct Patch still refused. Review only, no execution, extraction into an application directory or remote operation.

User supplied `v1_4sXjS.zip`,3,593,880bytes, SHA256 `f48a6d3abf2d203168fe749b4258ef9270a747947d1655b05af8b425a8ed9ff6`. The original input remains outside Git. It contains a real.env entry: its content was not decompressed/read, echoed, copied into a deliverable or committed. No sensitive configuration values are included here.

## Offline checks

- 2,656 ZIP entries; no duplicate or traversing paths found.
- Manifest and SHA256SUMS match the preserved6b original exactly, consistent with the prior live read-only receipt.
- All2,232 available original checksum-listed files match original content; no changed known file. `.env.example` is absent from this archive, resolving the earlier single-path failure as a missing template.
- No apps/server/dist/auth/accounts.js module or /api/accounts route definition exists in the supplied application JS tree. This directly explains the absent account-management route in this old deployment; it is not evidence of a wrong admin password.
- The original11 symlinks have been dereferenced by the download/compression process:9 executable links became files and the2 workspace links became directories. The earlier live collector reported actual links. This archive therefore cannot prove a new live type change or be used as a byte/type-faithful replacement BASE. Do not upload it back over the server.
- Locally added start.mjs is138bytes, SHA256 `dd3c4406fdc456f565529ff6640a99c17756c17c16630b503df2666f695e469b`. Its reviewed logic imports node:process.loadEnvFile, loads the original absolute application.env path, then imports ./apps/server/dist/index.js. No hardcoded connection URI or secret assignment was found in that starter. It differs from TARGET's managed entry; do not automatically overwrite it or claim unchanged TARGET entry integrity after manually substituting it.
- Archive safety guard returns `SECRET_FILE` without extraction because.env is present. This is expected refusal, not an instruction to delete or modify the live.env.

## Upgrade boundary

The existing program is still source6b18850, package latest SQL014. Target9308077 adds the account workflow and SQL015/016 and changes the shared contract digest. Actual database migration records have not been supplied; do not equate packaged latest SQL with applied schema state.

The verified569→930 example Patch is not for this installation. Use the trusted full930 Linux ZIP as a **candidate**, requiring review of the6b-to930 migration path, original starter preservation/identity, backups, actual database ledger/roles and unique PM2 project before any deployment. No migration, Seed, admin reset, chmod normalization, service restart, unknown-file cleanup or COS operation was performed.

See [received baseline](SERVER-BASELINE-6B18850-20261107.md) and [delivery evidence](SERVER-PATCH-DELIVERY-20261107.md). Current server Patch installation remains BLOCKED; original remote/COS/Alpha gates remain open.
