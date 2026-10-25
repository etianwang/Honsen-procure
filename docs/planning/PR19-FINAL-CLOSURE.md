# PR #19 final closure

Scope authorized on 2026-10-24: HEIC import, real two-client Windows IPC/HTTPS/payment/COS evidence, minimal unified-baseline conflict resolution and release handoff. Keep Draft; no production migration, deployment or merge.

1. Merge `origin/codex/v1-unified-baseline` into the payment branch, preserving current authorization, account ownership, formal snapshots, quotation and synchronization behavior. Reconcile migration aliases additively.
2. Add a pinned, statically compiled Rust HEIC decoder. Decode genuine HEIC to bounded JPEG preview/upload bytes; archive the unchanged original and immutable source-to-derivative relation. Reject corrupt, unsupported and over-limit inputs before creating queue records. Test with attributed synthetic HEIC fixtures.
3. Reuse the Windows native harness for two EXEs with separate SQLite profiles and actual Rust IPC over validated HTTPS to disposable PostgreSQL 16 and the authorized isolated COS prefix. Verify payments, reversal, retries, restart, authorized attachment reads and rejected scope.
4. Run affected checks, independently review changed boundaries, commit and push checkpoints, verify GitHub quality. Record deployment ordering, migration filenames, COS configuration and backward-compatibility boundaries for release-toolbox.

Acceptance remains open until each required real boundary is evidenced. Earlier API/COS and in-process SQLite evidence does not substitute for actual Windows IPC acceptance.
