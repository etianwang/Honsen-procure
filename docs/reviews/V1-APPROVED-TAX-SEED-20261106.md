# V1 user-approved tax Seed — 2026-11-06

Scope: approved CI18% and CM19.25% operational configuration, not legal-rate verification. Stamp duty remains manual under the separate approved workflow; this Seed never adds a fixed duty or auto-applies a per-order amount.

Fresh bootstrap now writes CI-VAT1800 and CM-VAT1925 basis points plus three project default links in the same transaction as accounts/master data and sync publication. It preserves the approved currencies XOF/XAF, adds no site records and uses existing approved company print addresses from seed/master-data.json with null contacts. Effective date2026-11-06 denotes configuration approval, not a claim of statutory effect.

The five new tax/default records publish existing-contract payloads (TaxTemplate camelCase plus version1; ProjectDefaults camelCase). Total initial sync_entities/server_change_log records are24. Tax/default IDs are generated UUIDs. Permanent audit records identify the user-approved configuration and its one-time application.

Controlled old-candidate upgrade entry: `POSTGRES_URL=<migration/seed owner connection> node apps/server/dist/scripts/apply-v1-tax-config.js`. It requires the previous bootstrap's permanent provenance, uses the same advisory transaction lock and never resets passwords. If a tax/default configuration already exists before this seed marker, it refuses the entire operation for review. Once applied, repeats preserve all user edits and report already_applied_preserving_user_configuration, rather than silently overwriting settings.

Actual isolated PostgreSQL16.15 tests: Seed5/5 PASS for fresh data/payloads, original SQL failure rollback, post-tax-publication/default SQL failure rollback with zero retained rows, existing-bootstrap append configuration, conflict refusal, repeat idempotency, retained password and edited-tax preservation. The controlled CLI repeat also ran. Combined Seed/auth/runtime-role/migration targeted13/13 PASS before the additional Seed failure regression; later Seed5/5 PASS. Strict server typecheck/lint/production build PASS. A/C must still independently accept rebuilt ZIP, runtime API tax/default reads and manual stamp behavior. No database migration was added by this Seed slice.

Historical missing-authority blockers in earlier reports are superseded only for the explicit user-approved CI/CM configuration; no legal verification is claimed. Existing unrelated security/native/COS/final gates remain separate. Main agent owns combined task/memory/roadmap status and final-source provenance.
