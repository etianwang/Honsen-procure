# T08/T10 desktop integration conflict evidence

Captured read-only on 2026-10-16 from
`C:\Users\This PC\.codex\worktrees\t08-t10-desktop-integration\Honsen materials`.
That worktree was not modified, reset, cleaned, or stashed.

## Recorded state

- Branch: `codex/t08-t10-desktop-integration`
- `HEAD`: `0a42ebead9797250261297c35a9378507cc8c7f6`
- Status: unmerged `apps/desktop/src-tauri/src/lib.rs`, `docs/BUILD-TASKS.md`,
  `docs/ROADMAP.md`, and `memory.md`.
- Merge base: `9f0a542a038b87d0f57379d60679e3453fc50537`.
- Ours: `0a42ebead9797250261297c35a9378507cc8c7f6`
  (`fix: isolate desktop pull state by account`), whose ancestry includes the
  RFQ integration tip `23c9d7321c733dee4f773fb2c3b3913b18b08350`.
- Theirs: `f0cbe71a8d8afddc42ad4aaa3987dc911874e96d`
  (`fix: alias unreleased sync owner migration safely`).

## `lib.rs` conflict stages

| Stage | Blob SHA | Meaning |
| --- | --- | --- |
| base | `687ef442eaeacba8b17b83a3f4be70bfadd2c21a` | Common ancestor content |
| ours | `d57dd23cb54e1c090878a221018919aa1dd4743d` | RFQ-containing integration line |
| theirs | `36c0a46f4e0b5075d60ec3bf2ea3939206bbd509` | T10 interim owner-marker alias line |

The overlap has two independent behaviors that must both remain:

1. `0032_rfq_display_numbers` temporarily disables foreign keys, applies its
   table rebuild in a transaction, runs `pragma_foreign_key_check`, writes its
   marker, and restores the prior foreign-key setting.
2. `0046_sync_outbox_account_boundary` detects only the exact unreleased
   `0044` checksum plus expected nullable owner column, foreign key, and
   pending index; it writes the equivalent `0046` marker atomically without
   re-running DDL or attributing legacy outbox rows.

The migration sequence contains `0032_rfq_display_numbers`,
`0044_local_formal_issue`, `0045_procurement_expenditures`,
`0046_sync_outbox_account_boundary`, and `0047_sync_account_pull_state`.
The existing callers are the single `migrate` loop and its migration tests in
`apps/desktop/src-tauri/src/lib.rs`.

The non-code conflicts contain parallel task evidence only. They are not an
authority to mark T08, T10, or their milestones accepted. The integration must
retain that status and add only evidence specific to this resolution.
