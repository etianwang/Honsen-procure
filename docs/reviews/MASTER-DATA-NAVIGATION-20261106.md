# Master data — category navigation and tables

User-selected bounded UI change under existing master-data acceptance: three navigation groups and ten categories. Started clean at `1ec9e9c` on task branch `codex/master-data-navigation-20261106`, after fetching `origin/main`. No application/server/installer deployment or user data operation.

## Preserved behavior

- Organization: countries, projects, sites, departments and teams.
- Purchasing dictionaries: units and material categories.
- Finance and documents: tax templates, exchange-rate history and project print defaults.
- Original seven reference editors and all three finance/default editor implementations remain unchanged. All fields, validation, create/edit/enable/disable/save actions, read-only restrictions and pending-sync wording remain in place.
- The original shared reference-data manager stays mounted. Controlled category Tabs hide duplicate navigation, force-render their content and retain hidden instances. Finance/default panels are hidden rather than unmounted. Switching categories retains unsaved inputs; leaving the page is explicitly identified as requiring save.
- Sidebar classes, selected-state styling, responsive layout and right-hand data-table containment are presentation only. Translations cover Chinese, English and French.

No Rust, API, schema, migration, outbox, money calculation, snapshot, Toolbox identity/Runner/installer/result/uninstall boundary changed. Previously recorded Toolbox gaps remain open and unchanged. No dependency or lockfile change.

## Validation

Builder desktop typecheck/lint/unit30/production build/format/diff checks passed. Independent source comparison confirmed no editor or service behavior was removed. Independent DOM and screenshots are recorded after execution. Existing lint/chunk warnings remain nonblocking. Unrelated PostgreSQL, Rust/native/install tests are not rerun for this renderer-only change and do not become accepted by these checks.

Independent DOM results: initial targeted run 13 PASS / 1 FAIL. The failure was a test treating the read-only project's browsing selector as a mutation control; its assertion was corrected without changing product permission behavior. Focused read-only rerun 1 PASS; visual/navigation rerun 1 PASS. Coverage includes ten reachable categories, four draft-preservation paths, three UI languages, read-only behavior, 1024 layout/global sidebar scroll and original country/project/site/unit/department/team/category/tax/exchange/default CRUD regressions. Mock IPC does not establish remote or native acceptance. Source review independently confirmed all editor implementations and trusted calls unchanged.

Status: bounded local implementation and independent checks passed; original remote Alpha/security/release gates remain open. No parent milestone is closed. Master-data layout screenshots were inspected and project-default headings/summary styling adjusted without changing fields.

## Final candidate

Latest 1024 screenshot target passed after scoped project-default styling; title visibility and no-horizontal-overflow were asserted, and screenshots were inspected. Existing-VS Release build passed (31.08s), embedding current frontend. Diagnostic executable `.cache/remote-alpha-master-data/HonsenProcure.exe`, SHA-256 `7d6586b241fdf62218f8e628503fd693d4ba28a95e535be5b1f2ea36f61cf67e`; log `.cache/remote-alpha-b/build-master-data-vs.log`. Not launched, no existing candidate overwritten. This is not an installer or Alpha acceptance. Exact application source is this report's containing checkpoint commit; metadata-only records do not affect the embedded application boundary.

BLOCKER: none within the selected local appearance change. DEFERRED: all original remote/native/installed/security/Formal/Toolbox final gates. WARNING: existing effect/chunk/advisory warnings. No database migration/data effect. No next task or release started.
