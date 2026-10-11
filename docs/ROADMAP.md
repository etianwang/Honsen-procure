# Roadmap and Development Tasks

The authoritative execution order and mandatory per-task DOM testing gate are in [BUILD-TASKS.md](BUILD-TASKS.md). This file remains a compact milestone index.

## Milestone 0 — Foundation

- [x] React desktop visual shell: 首页 and 材料库总览, including four supplier quote cards and client-side role visibility test
- [x] Monorepo workspace, shared Zod/money contracts, server package placeholder and CI quality gates
- [x] Tauri-ready host boundary and design tokens (release/bundle identity intentionally deferred)
- [x] Versioned SQLite authentication migration, secure offline verifier cache and Rust/Tauri authorization boundary
- [x] SQLite material/supplier/price repositories, square material-image crop and trusted local catalog commands
- [ ] Authorized initial master-data deployment records (requires the deployment account; codes are intentionally never migration seeds)
- [x] CI formatting/lint/typecheck/test/build and Playwright DOM gate

## Milestone 1 — Local catalog and protected backend

- [ ] Admin password setup/unlock/lock and rate limiting in Rust boundary
- [ ] Material and supplier CRUD
- [ ] Supplier-specific manual prices and price history
- [ ] Search and validation
- [ ] Unit/integration tests

## Milestone 2 — Offline ordering

- [ ] Two-column prescription-style order screen
- [ ] Cart, quantity, overrides, exact totals
- [ ] Order draft, confirmation, history, copy/reprint
- [ ] A4 bilingual PDF and printing
- [ ] Snapshot integrity tests

## Milestone 3 — Cloud sync

- [ ] PostgreSQL schema + transactional change log
- [ ] Account-session authentication, scoped synchronization and one-online-session enforcement
- [ ] SQLite transactional outbox
- [ ] Push idempotency, version checks, conflict records
- [ ] Pull cursor, retries, connectivity status
- [ ] Multi-device chaos tests

## Milestone 4 — Hardening and release

- [ ] Windows installer (Inno Setup or MSI) and update strategy compatible with the Honsen Toolbox contract
- [ ] Honsen Toolbox contract: approved identity, manifest, Runner, registry and E2E acceptance
- [ ] Data export/backup/restore
- [ ] Performance with 10k+ catalog entries
- [ ] Multi-page print QA and accessibility
- [ ] User acceptance testing and release checklist

## Suggested first Codex task

Implement Milestone 0 only. Do not scaffold sync, PDF, installer or update machinery until architecture/contracts and migrations are reviewed.
