# T04 material category independent QA

Verdict: **FAIL**. Production candidate: `a0a8aa0bf268e5fb7e912c5b64a0fd6178389af9`; baseline: `d15a5f3039430819aa220bfa312f4db5be251c03`. This report does not modify the candidate.

## BLOCKER: migration 0048 rejects existing exchange-rate audit history

Migration 0043 permits `exchange_rate` in `local_master_data_audit_entries.entity_type`, and `save_exchange_rate` writes that type. Migration 0048 rebuilds the table without that allowed value and copies all previous rows. Independent reproduction on Windows using Python 3.14's SQLite: create the previous audit table, insert one valid `exchange_rate` audit row, then execute the unmodified candidate's `0048_material_category_audit.sql`. SQLite returns `IntegrityError: CHECK constraint failed: entity_type IN ('country', 'project', 'site', 'unit', 'department', 'team', 'tax_template', 'material_category')`. The process exits 1. The fixture was an in-memory database; no user database was touched. Existing installations containing such history cannot complete the migration. Even an installation without such history has a rebuilt constraint that cannot accept later exchange-rate audit entries.

Minimum repair: retain every entity type permitted by migration 0043, including `exchange_rate`, in 0048 and add an upgrade regression with historical exchange-rate rows and a post-upgrade exchange-rate audit write. Re-run independent QA on the resulting new candidate SHA.

## BLOCKER: synchronization payload mismatch requiring end-to-end confirmation

Source inspection: category writes serialize the tagged `ReferenceMasterDataInput::MaterialCategory` with snake_case fields (`business_code`, `is_active`); the category pull projection deserializes `MaterialCategoryInput`, whose fields are camelCase (`businessCode`, `isActive`). The server category path is not among the reference types normalized for validation, and the generic PostgreSQL sync store retains the incoming payload in the change log. Consequently the observed code paths appear incompatible; an actual PostgreSQL Push/Pull run was not performed, so this is a strong code-level finding, not a claimed end-to-end reproduction. Verify the complete path and resolve the payload contract in the repair candidate.

## Scope and remaining evidence

- Candidate ancestry: `git merge-base --is-ancestor d15a5f3 a0a8aa0` returned 0.
- Fresh migration negative test: FAIL as described above. No production code was changed.
- The isolated QA worktree started clean and is on `codex/qa-t04-material-category`.
- Admin/non-admin IPC, full category lifecycle, referenced materials, rollback, PostgreSQL two-desktop Push/Pull and replay were not independently executed. They remain acceptance evidence gaps; no PASS is claimed for them.
- The separate PostgreSQL environment was not established; no existing databases, ports, Compose projects, build targets or QA worktrees were changed. No full Native QA was run.
- The local reproduction is deliberately narrow; it does not demonstrate the application's migration transaction rollback or an actual application launch.
- GitHub PR #13 was checked and was OPEN, Draft, base `main`, head `codex/v1-unified-baseline` at the time of review. Its status is not a release approval.

No G4, T11-A, T13, PostgreSQL release gate, or Formal hold status is changed. Recommendation: do not merge; return the candidate for a minimal repair, then run targeted migration, authorization, atomicity and real isolated PostgreSQL sync QA against the repaired SHA.
