# Verified backup uniqueness and retention — 2026-11-04

Status: PASS for the original T13 Linux backup collision/retention slice. Full application backup/recovery remains OPEN.

## Scope

Confirmed defect: deploy/linux/scripts/backup.sh used a seconds-only final filename and overwriting mv, so multiple successful backups in one second replaced an earlier valid archive. Required latest10 retention was absent. No restore/replacement-database protocol, schema, authorization, Toolbox or production settings changed.

The script now serializes work with an atomic dedicated mkdir lock, writes a private mktemp partial, verifies pg_restore listing, and publishes a timestamp/UUID managed-v1 archive with hard-link no-clobber semantics. A private SHA-256 sidecar is likewise published without replacement. Retention runs only after successful verification/publication, sorts real archive mtimes (including same-second nanoseconds), and preserves the newest10 verified managed-v1 archives.

Only strictly named regular files with one link, regular single-link proof files, valid proof syntax and matching digest are eligible. Legacy names, arbitrary files, symlinks, externally hard-linked files and unmatched/corrupt proof records are untouched. This does not retroactively govern historical backups. A failed dump or verification never prunes existing successes. A preexisting lock fails closed and is not removed. After an interrupted process/SIGKILL, an operator must verify no backup writer owns that directory before manually removing the stale lock; there is no automatic lock-stealing.

## Actual RED → GREEN

Test: tests/deploy/test-backup-retention.sh; real cached PostgreSQL16 Alpine, network none, no host port or persistent volume. Each test created a fresh disposable /tmp/honsen-procure-retention-* root; deletion was confined to that synthetic root by its EXIT trap. No existing backup directory or business database was opened.

- Original HEAD script, forced identical timestamp for 12 real pg_dump calls: FAIL as expected, `same-second backup overwrite detected`, exit1. Log .cache/backup-retention-red-20261104.log.
- New script: 12 distinct archives, exact newest10 retained, each retained archive passes pg_restore listing; injected pg_dump failure leaves successful files/digests unchanged; unmanaged/legacy/symlink targets retained; preexisting lock refused; forced repeated UUID publication rejected without changing existing archive. PASS exit0. Log .cache/backup-retention-green-20261104.log.

The safe host wrapper .cache/run-c-retention.sh adapts Alpine BusyBox realpath's missing -m option only for an already-created test directory. No production realpath behavior was changed. Initial attempts hit WSL container shutdown, a Windows-written old-script CRLF and BusyBox realpath incompatibility before reaching the regression; the valid RED/GREEN runs followed corrections to test setup. No dependencies were installed. Task-owned honsen-c-retention container was removed after verification.

Bash syntax/diff checks pass. Actual acceptance applies to the containing commit's backup/test code; the installer source2812631 predates this Linux-only repair and is not relabeled as containing it. There is no desktop/UI behavior in this slice.

## Remaining gates

BLOCKER for parent backup/recovery: authenticated restored API/client readback, complete account/approval/business workflow provisioning and real attachment-object recovery remain unaccepted. Desktop backup/restore UI/cancel/retention behavior is not implemented or proven by this Linux script. System-wide corruption, hostile concurrent users with directory-write access and filesystem without hard-link support remain outside this bounded test; unsupported hard-link publication fails rather than overwriting a previous backup.

Independent review hardening: before acquiring the lock or creating/pruning any archive, an existing backup directory must be owned by the executing UID and have no group/world write permission. The script refuses an unsafe directory rather than changing its permissions. Final real-PG regression also verifies chmod0777 on the disposable test directory is rejected with all existing files unchanged, and injected pg_restore verification failure cannot prune old backups. Final safe GREEN log records exit0 after these additions. If metadata publication fails after archive publication, a valid orphan archive is retained without pruning; no automatic orphan deletion is introduced.
