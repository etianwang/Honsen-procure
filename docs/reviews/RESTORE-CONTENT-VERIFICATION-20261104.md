# Backup content verification — 2026-11-04

Status: PASS for the bounded restore-verifier regression; full V1 recovery remains OPEN.

Base source: `2c5576b61c9215a8699c3a5206c3704cc2817aac`, with the two verifier/test changes in this report's containing commit. This is not an installed-client acceptance SHA.

## Actual execution

Two independent ephemeral PostgreSQL 16 Alpine clusters (`honsen-c-restore-source`, `honsen-c-restore-target`) shared an isolated network namespace, using ports 5432/5433 internally. No host ports or persistent volumes. Actual command: `docker exec honsen-c-restore-source bash /repo/.cache/run-c-restore.sh` (test-host wrapper); exit 0.

- Independent-cluster archive restore with matching public table contents: PASS.
- Same row counts but synthetic payment amount changed: rejected, PASS.
- Source and destination on the same PostgreSQL cluster: rejected, PASS.
- Invalid archive: rejected, PASS.
- Bash syntax and `git diff --check`: PASS.

The verifier compares sorted JSON row representations for every public table, with quoted SQL identifiers and fixed UTC/ISO/float rendering. Only aggregate fingerprints are compared in memory; no row contents or fingerprint values are printed. Source must be quiescent: this does not establish arbitrary concurrent online-backup consistency.

## Environment observations and cleanup

Alpine BusyBox mktemp rejects the existing GNU suffix template in backup.sh. Initial execution failed before archive creation. An ignored test-host wrapper adapts only mktemp suffix handling; production backup.sh was unchanged. An attempted temporary package fetch could not run on the isolated network; no packages were installed. Existing Docker was invoked from the existing WSL root account because no normal development user exists; no account/default/group settings changed.

Both task-owned containers were removed after the run. No production database, COS object, registry, installer or Toolbox contract was changed.

## Remaining gates

BLOCKER for full recovery: this regression uses synthetic JSON history records, not the complete application schema. It does not establish service restart, client readback, upgraded installed-client behavior, full order/payment/reversal relational integrity, or attachment object restoration. Attachment-reference JSON is not attachment-byte recovery. These gates remain unpassed.

DEFERRED: installed security and Toolbox joint launch/apply remain separate acceptance. Existing installation P1 evidence is unchanged and was not repeated.
Image ID: sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab (cached postgres:16-alpine). Repeat run verified postgres (PostgreSQL) 16.15. Raw runner retained at .cache/run-c-restore.sh; safe stdout/stderr and exit=0 are retained in .cache/restore-content-20261104.log. Repeat-run containers were removed.
