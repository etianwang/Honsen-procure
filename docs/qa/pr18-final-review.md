# PR #18 independent final review

Verdict: CHANGES_REQUIRED. Reviewed production SHA `0f9895ae4df12abdccda57246c13eccebb66e000`, target `27dda9cbe73052a255255c755dc52dfdcb79f027`.

## P1: owner issue skips stale catalog quote validation

`apps/desktop/src-tauri/src/lib.rs:3511` filters `owner_quote_source = 'catalog'`, but `save_owner_purchase_pricing` writes `catalog_price` (line 3383). Thus the added query never checks actual owner catalog lines. An approved owner order can be formally issued after its locally known quote is deactivated or its supplier blacklisted; the issue transaction freezes the stale snapshot. SPECS requires a draft with a revoked quote to select an active quote or manual reference before issue. The server deliberately retains offline-issued snapshots and records a discrepancy, so it does not undo this local violation.

Fix the source predicate and verify the full issue-time checks against the actual persisted snapshot and supplier; add a focused regression that saves catalog pricing, approves the order, deactivates the quote or blacklists its supplier, and verifies issue fails without allocating a formal number or changing the draft. Preserve the already-issued snapshot behavior when changes happen after issue.

## Evidence and boundaries

- Independent QA `4c15405045bcf066dbcc4fea0a1be6b507f2591e`, `docs/qa/pr18-quote/RECHECK-0f9895.md`, reports targeted PASS on the production SHA; its formal snapshot scenario changes the price after issue and does not exercise this before-issue case. Its test-only server extension is separate from production.
- GitHub PR head and remote branch were the reviewed SHA; both quality checks passed. Target was the SHA above and GitHub reported MERGEABLE/CLEAN.
- PR #17 remains unmerged at `20da0985fdb18b1e4a6571c54de8a0a4af40282c`; a read-only three-way merge showed conflicts in `App.tsx`, `MaterialsPage.tsx` and `memory.md`. Resolve and recheck project scope and country isolation when integrating. Overall release remains blocked on PR #17 security acceptance.
- No full Windows A/B, T04, T10, Linux deployment or live desktop-to-server sync was rerun. Review finding is based on the exact production source; no application code or production data was changed.
