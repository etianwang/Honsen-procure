# Honsen采购管理系统

Honsen采购管理系统（HONSEN Procure）是一套面向海外机电项目的本地优先 Windows 采购桌面应用。每次启动都需要认证；已认证用户可在规定时限内离线继续处理其所属项目的采购工作。同步通过已认证账号会话安全增量进行，不提供公开设备注册流程。

This repository currently contains the engineering specification set. It is intentionally not yet an application scaffold.

**Source repository:** <https://github.com/etianwang/Honsen-procure.git>

## Read before changing code

Start with [AGENTS.md](AGENTS.md), then read the documents in this order:

1. [Product requirements](docs/PRD.md)
2. [Functional and data specification](docs/SPECS.md)
3. [Architecture](docs/ARCHITECTURE.md)
4. [Coding standards](docs/CODING-STANDARDS.md)
5. [Database and migrations](docs/DATABASE.md)
6. [Synchronization protocol](docs/SYNC-PROTOCOL.md)
7. [Security](docs/SECURITY.md)
8. [UI specification](docs/UI-SPEC.md)
9. [Test rules](docs/TEST-RULES.md)
10. [Open decisions](docs/DECISIONS.md)
11. [Roadmap](docs/ROADMAP.md)

For any Windows installation, update, release or publishing work, also read [Toolbox integration](docs/HONSEN_TOOLBOX_INTEGRATION.md) and the upstream toolbox documents it links to. It is a fixed cross-project contract.

## Documentation map

| Document                             | Source of truth for                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `AGENTS.md`                          | Mandatory agent workflow and non-negotiable constraints                         |
| `docs/PRD.md`                        | Product scope and user outcomes                                                 |
| `docs/SPECS.md`                      | Screens, entities, validation and HTTP contract shape                           |
| `docs/ARCHITECTURE.md`               | Component boundaries and local/cloud behavior                                   |
| `docs/CODING-STANDARDS.md`           | Repository layout, TypeScript/Rust/SQL rules and review expectations            |
| `docs/DATABASE.md`                   | Schema ownership, migration and historical-data rules                           |
| `docs/SYNC-PROTOCOL.md`              | Outbox, idempotency, cursor pull and conflicts                                  |
| `docs/SECURITY.md`                   | Authentication, authorization and secret-handling boundaries                    |
| `docs/UI-SPEC.md`                    | Screen-by-screen desktop UI, subviews, actions and roles                        |
| `docs/TEST-RULES.md`                 | Required automated and manual verification                                      |
| `docs/HONSEN_TOOLBOX_INTEGRATION.md` | Windows installer/update/toolbox contract and gaps                              |
| `docs/DECISIONS.md`                  | Confirmed choices and decisions that still need an owner                        |
| `docs/INITIAL-MASTER-DATA.md`        | Approved initial organization, numbering, currency and deployment configuration |
| `docs/BUILD-TASKS.md`                | Ordered implementation tasks and mandatory code/DOM acceptance gates            |
| `memory.md`                          | Persistent progress, verification evidence and regression-prevention notes      |

## Recommended first implementation task

Implement Milestone 0 only: establish the monorepo, strict TypeScript shared contracts, SQLite migration harness, Tauri boundary validation, and CI quality gates. Do not scaffold supplier integration, cloud synchronization, update machinery, or a login page until the corresponding decisions and contracts are reviewed.
