# Native chain preparation — 2026-11-04

Source preparation baseline: 28b32c6792490fbdd9179845838c34646b14ee3b. No application code change.

The explicitly supplied cos.txt was readable and contained four nonempty required fields. Only names/completeness and nonsecret region/bucket were inspected for reporting. No credential values were printed or copied to Sandbox. Main controller confirmed user authorization for this run only: eu-frankfurt / honsen-materials-1308426049 / honsen-procure-tests/<fresh random UUID>/. Only run-owned new objects may be uploaded/read/deleted; historical objects remain out of scope. No COS network operation was performed during preparation.

Runner compatibility change: optional WslDistribution and WslUser parameters replace hardcoded distribution/user in path conversion, Compose startup and teardown, preserving previous defaults. COS configuration parsing accepts surrounding whitespace and quotes, rejects duplicate/missing/empty required fields without exposing values, loads only the four permitted fields into the process environment, then clears the temporary map. Original runner backed up under .cache/native-compat-backup-20261104 before editing.

Validation: PowerShell Parser.ParseFile returned no errors; node --check tests/native/t09-t11-chain.mjs exited 0. These are syntax checks only. No native-chain acceptance is claimed.

Next: wait for all task-owned code to enter the unified candidate, build matching native application/profile-tool and frontend, then execute isolated PostgreSQL/HTTPS/dual-client/COS chain and retain exact SHA, executable hashes and owned-prefix cleanup evidence. Set explicit WSL distribution/user or use a verified isolated ExistingDatabase. No Cargo was run during this preparation.
