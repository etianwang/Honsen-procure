# T01–T10 功能实现独立审计

审计日期：2026-10-16（第一轮检查点）  
审计对象：`main` (`5139cc8`) 及 `git worktree list` 枚举的全部 27 个 worktree。  
性质：只读功能审计；本文件是审计 worktree `codex/t01-t10-feature-audit` 的文档产物，不修改业务代码。

## 审计口径与证据边界

- **代码状态**基于实际源文件、迁移、调用链和已提交测试；不会仅依据任务勾选状态判定完成。
- **验收状态**只承认已提交的 QA/测试记录，且单 worktree 的通过不等于跨分支可执行。此轮没有重跑全量测试，故不会把历史结果表述为本轮新验证。
- `ACCEPTED` 表示此审计的功能点代码闭环且存在相应历史验收证据；`IMPLEMENTED` 表示已实现但验收欠缺；`PARTIAL` 表示业务流缺段；`SCAFFOLDED` 是结构/界面/接口先行；`MISSING` 是未发现实现；`BLOCKED` 指外部或整合阻塞；`UNVERIFIED` 用于未能从本轮证据确认的事实。
- 来源依次包括 `docs/PRD.md`、`docs/SPECS.md`、`docs/ARCHITECTURE.md`、`docs/DATABASE.md`、`docs/SYNC-PROTOCOL.md`、`docs/SECURITY.md`、`docs/TEST-RULES.md`、`docs/ROADMAP.md`、`docs/BUILD-TASKS.md`、`memory.md`、现有 Multi-Agent Workflow、协调/QA 文档和 Git 对象。

## 第一轮：需求追踪矩阵

### B. 逐功能追踪矩阵

“QA/验收”与“代码状态”独立记录。路径无行号时，文件本身及所列命令/符号可直接定位证据。

| Task | 功能 ID | 原始需求 | 代码状态 | QA/验收状态 | 代码证据 | 测试/QA 证据 | 缺失内容 | 所属分支/SHA |
|---|---|---|---|---|---|---|---|---|
| T01 | T01-01 | 角色、语言、币种、金额传输 Zod 合约 | ACCEPTED | 已接受（历史） | `packages/shared/src/contracts.ts`, `money.ts` | `money.test.ts`; `tests/e2e/navigation.spec.ts:394` | 无已识别缺口 | `main` `5139cc8` |
| T01 | T01-02 | BigInt 整数最小单位、数量与半入舍五入 | ACCEPTED | 已接受（历史） | `packages/shared/src/money.ts:36-91` | `money.test.ts` | 无已识别缺口 | `main` |
| T01 | T01-03 | 四币种格式化 DOM 证明 | ACCEPTED | 已接受（历史） | `apps/desktop/src/pages/MoneyPreviewPage.tsx` | `navigation.spec.ts:394` | 无 | `main` |
| T02 | T02-01 | PostgreSQL 账户、角色、项目/团队、会话、审计迁移 | IMPLEMENTED | 已接受切片；本轮未复跑 PG | `apps/server/migrations/001_auth_and_master_data.sql`, `002_project_defaults_and_master_data.sql` | `migration-runner.test.ts`; BUILD-TASKS T02-A/B | 仅历史 QA，不是本轮运行 | `main` |
| T02 | T02-02 | CAPTCHA/密码登录、首登、禁用/锁定错误 | IMPLEMENTED | 已接受切片 | `apps/server/src/app.ts`, `auth/service.ts`, `auth/captcha.ts` | `auth/service.test.ts`; `navigation.spec.ts:416` | 无法从 fixture 证明真实桌面/服务联通 | `main` |
| T02 | T02-03 | 一账号一在线会话、初始超管供应 | IMPLEMENTED | 已接受切片 | `auth/service.ts`, `db/postgres-auth-store.ts`, `scripts/provision-super-admin.ts` | BUILD-TASKS T02-B | 部署供应未实证 | `main` |
| T03 | T03-01 | SQLite 迁移、凭据 vault、离线登录 24h | IMPLEMENTED | 已接受切片 | `apps/desktop/src-tauri/migrations/0001_local_auth.sql`; `lib.rs:1152-1396` | Rust tests in `lib.rs`; `navigation.spec.ts:437` | 实际多账户/在线撤销不在本任务闭环 | `main` |
| T03 | T03-02 | CAPTCHA、30 分钟锁定、五次失败锁定 | IMPLEMENTED | 已接受切片 | `lib.rs:1204-1396` | Rust tests and offline fixture | 本轮未启动真实 Tauri 主机 | `main` |
| T03 | T03-03 | Rust 受信任角色边界，篡改 DOM 不能改材料 | IMPLEMENTED | 已接受切片 | `lib.rs:1397-1438`, `5173-5180` | `navigation.spec.ts:437`; Rust authorization tests | renderer fixture 不等于跨进程证明 | `main` |
| T04 | T04-01 | 国家/项目/站点/部门/团队 CRUD 与不可变代码 | PARTIAL | 部分 QA；未正式验收 | `lib.rs:1478-1794`; migrations `0002`,`0003`; candidate `5fa5afc…e8c170b` | `master-data.test.ts`; `navigation.spec.ts:489-532` | 当前 main 仅基础边界；完整离线管理和云投影在未合并候选 | `main`; `codex/t04-unit-management` `74365f0` |
| T04 | T04-02 | 单位、税模、汇率和项目打印默认值 | PARTIAL | 个别切片 QA；未正式验收 | `lib.rs:1440-1865`; server `master-data/*` | `master-data.test.ts`; BUILD-TASKS T04 | 当前 main 无完整单位/税/汇率 UI；候选有 `0040–0043` 与组件 | `main`; `74365f0` |
| T04 | T04-03 | 授权初始数据真实初始化、无破坏 Seed | IMPLEMENTED（本地）/BLOCKED（部署） | 本地验证；部署未验收 | `seed/master-data.json`, `src-tauri/src/seed.rs`, `bin/seed.rs` | BUILD-TASKS “T04 Seed engine” | 没有授权部署账户/窗口；不能把测试 Seed 当实际初始化 | `main` |
| T04 | T04-04 | REST 保存发布到 Pull；离线一致性/权限 | PARTIAL | 切片 QA | server `master-data/postgres-store.ts`; candidate sync projections | `postgres-store.test.ts`; QA `T04-001` | 并发修复、所有实体投影尚未整合到 main | `74365f0`, `7b408dec` |
| T05 | T05-01 | 材料、供应商、价格历史本地仓储 | IMPLEMENTED | 已接受切片 | migrations `0004_local_catalog.sql`; `lib.rs:1867-2007,3908-4140` | `catalog.test.ts`; `navigation.spec.ts:583-677` | 云文件归档不属 T05；本轮未复跑 | `main` |
| T05 | T05-02 | 图片源文件、1:1 裁剪派生图 | IMPLEMENTED | 已接受切片 | `MaterialImageCropper.tsx`; migration `0005_local_material_images.sql`; `lib.rs:2008-2100` | catalog DOM flow | 不含服务端附件归档（T11） | `main` |
| T05 | T05-03 | 工程师/观察者只读，采购/管理员受信任写入 | IMPLEMENTED | 已接受切片 | `lib.rs:1423-1438,1867-2007`; `MaterialsPage.tsx` | `permissions.test.ts`; `navigation.spec.ts:583` | 无已识别缺口 | `main` |
| T06 | T06-01 | 父请购单头、行、附件元数据、自动保存 | IMPLEMENTED | 已接受本地切片 | migration `0006_local_requisitions.sql`; `lib.rs:2101-2210,3406-3546`; `RequisitionPage.tsx` | `orders.test.ts`; `navigation.spec.ts:779` | 文件实际摄取/归档是 T11，非 T06 实现 | `main` |
| T06 | T06-02 | 精确数量/折扣/运费/税计算和快照 | IMPLEMENTED | 已接受本地切片 | `packages/shared/src/orders.ts`; requisition migrations | `orders.test.ts` | 没有 PDF 快照消费方（T12） | `main` |
| T06 | T06-03 | 提交至 pending confirmation | IMPLEMENTED | 已接受本地切片 | `lib.rs:3547-3594`; `OrderWorkflowPanel.tsx` | `navigation.spec.ts:779` | 无已识别本任务缺口 | `main` |
| T07 | T07-01 | 确认/驳回/撤回/修订，理由和审计 diff | IMPLEMENTED | 已接受本地切片 | migrations `0007`,`0008`; `lib.rs:3595-3767,3876-3907` | `navigation.spec.ts:1449` | 完整“拒绝后回编辑器”仍非所有路径可证 | `main` |
| T07 | T07-02 | 默认禁止自批，超管可审计覆盖 | IMPLEMENTED | 已接受切片 | `ApprovalPolicyPanel.tsx`; `lib.rs:3678-3723` | Rust policy tests | 无已识别缺口 | `main` |
| T07 | T07-03 | 不可变评论、@提及、通知 | PARTIAL | 评论证据存在；提及/投递未验收 | migrations `0009_order_notifications.sql`; `lib.rs:3768-3845`; `OrderWorkflowPanel.tsx` | `navigation.spec.ts:1449` | 未发现 @mention 解析/收件人投递/已读通知闭环 | `main` |
| T08 | T08-01 | RFQ、供应商分配、子订单条款与发送 | IMPLEMENTED（本地） | 切片 QA；父任务未验收 | migrations `0010`,`0012`,`0014`; `lib.rs:2581-3145`; panels | `navigation.spec.ts:942-1302`; QA `0958fca8`,`23c9d732` | 发送后的完整不可变正式文档/同步尚缺 | `main` + unmerged RFQ candidates |
| T08 | T08-02 | Owner 显式目录/手工参考、汇率换算、唯一 markup | IMPLEMENTED（本地定价） | 仅模拟 DOM/文件 SQLite 证据 | shared `orders.ts:26-78`; `lib.rs:2358-2530`; `RequisitionPage.tsx` | `navigation.spec.ts:27,124,310` | 真正正式签发、PDF 脱敏、原生多账户 smoke 未完成 | `main` |
| T08 | T08-03 | 本地离线 OPA 正式号码与冻结快照 | IMPLEMENTED（候选）/BLOCKED（整合） | QA 通过局部；不可组合 | candidate migration `0044_local_formal_issue.sql`, `lib.rs`; `6a006ed` | QA `2026-10-15-formal-server-sync-8e20a48.md` | 当前 main 没有 `0044`; 与同步候选整合未完成 | `6a006ed`, `5d93369` |
| T08 | T08-04 | Honsen 市场直采，不要求 RFQ/SPO | IMPLEMENTED（本地） | 既有 DOM 证据；父任务未验收 | `lib.rs:2315-2357`; migration `0031`; `ProcurementExecutionPage.tsx` | `navigation.spec.ts:1177` | 实际支出、正式 HPA/SPO、完整状态/同步仍缺 | `main` |
| T09 | T09-01 | 多次部分收货、累计与超收理由 | PARTIAL | 局部 DOM/SQLite QA | migration `0013_receipts.sql`; `lib.rs:3146-3353`; `ReceiptPanel.tsx` | `navigation.spec.ts:1177,1372` | 未见原始验收要求的“两批+超收理由”完整证据 | `main` |
| T09 | T09-02 | Honsen 多笔不可变付款/凭证警告；Owner 禁止付款 | IMPLEMENTED（候选本地）/BLOCKED（同步） | 局部 QA | `0045_procurement_expenditures.sql`; `ProcurementExpenditurePanel.tsx` | QA handoff `cbc129a` | main 无此迁移；服务端付款投影/拉取设计 `INT-002` 未完成 | `cbc129a`, `c3bf374` |
| T09 | T09-03 | 条件完成关闭和关闭后不可修改/删除 | PARTIAL | 局部 DOM | `lib.rs:3354-3405`; `ReceiptPanel.tsx` | `navigation.spec.ts:1372` | 对全部父/子/市场路径的不可变保留未组合验证 | `main` |
| T09 | T09-04 | 收货图片/文件、最多十张、压缩、归档 | SCAFFOLDED | BLOCKED（T11 依赖） | migration `0015_receipt_attachment_links.sql` | migration existence tests | 无上传/压缩/大小/类型/归档业务闭环 | `main`; later attachment work is unmerged T11 scope |
| T10 | T10-01 | SQLite outbox 与业务写同一事务 | IMPLEMENTED（覆盖实体有限） | 有测试；父任务未验收 | migrations `0016`,`0020`; `lib.rs:4141-4188` | Rust tests; QA lifecycle | 未投影子单、RFQ、收货、附件和付款的完整链 | `main` |
| T10 | T10-02 | HTTPS Push/Pull、幂等、游标、冲突记录/解析 | PARTIAL | server/SQLite 切片 QA | `apps/server/src/sync/*`; `lib.rs:4189-4611`; `SyncConflictPanel.tsx` | `sync/*.test.ts`; `navigation.spec.ts:1436` | 业务实体投影不完整；多设备真实流程未证 | `main` |
| T10 | T10-03 | 启动/变更/周期/重连同步与状态 | PARTIAL（候选） | QA 局部通过 | candidate `apps/desktop/src/lib/sync-lifecycle.ts` | QA `2026-10-15-t10-lifecycle-598ef12.md` | main 无生命周期；候选尚未合并/组合 | `031ad67`, `5d93369` |
| T10 | T10-04 | WebSocket hint 驱动 cursor Pull | SCAFFOLDED（server）/MISSING（desktop） | 未验收 | `apps/server/src/app.ts:272-292` | `sync/api.test.ts:75-121` | 未发现桌面 `WebSocket` 客户端、missed-hint/reconnect proof | `main`; BUG `T10-GAP-002` |
| T10 | T10-05 | 账户/设备隔离、旧令牌/会话撤销、历史隔离 | PARTIAL（候选） | P1 仍 BLOCKED | candidates `0046`,`0047`, `514747d` migration `005_sync_event_origin.sql` | QA `9dbcaff`, `40ee8c9`, `514747d` | 5d93369 与 P1 七文件语义冲突；无 native A/B HTTP/撤销组合验证 | `5d93369`, `c82fd62`, `514747d` |
| T10 | T10-06 | 正式号码/报价快照不可变，碰撞转可审计冲突 | IMPLEMENTED（server候选）/BLOCKED | 服务端切片 QA；整合未验收 | `8e20a48` formal registry; candidate server migrations/tests | QA `formal-server-sync-8e20a48` | 与桌面 OPA/Push/Pull、汇率溯源、原生双端冲突尚未形成可执行树 | `8e20a48`, `e37902f`, `c82fd62` |

## 第一轮工作树事实

1. 受审主线为 `main@5139cc8`；当前用户 worktree 在 `codex/t04-unit-management@74365f0`，并有未跟踪 `.honsen-e2e/` 与 `.honsen-native-e2e/`，本审计未触碰。
2. 已枚举 27 个 worktree。关键候选：`6a006ed`（本地正式签发）、`cbc129a`（本地付款）、`5d93369`（桌面整合）、`e37902f`（formal server）、`514747d`（P1 origin binding）、`077148b`（格式修复）、`70bd54d`（协调检查点）。
3. `5d93369` 不是 `70bd54d` 的祖先；`514747d` 也不是。`c82fd62` 试图合并 P1，但其 worktree 留有未解决的 server/doc 冲突；不能称为可执行候选。
4. 现存 QA 记录明确：`5d93369` 的 Rust 52/52、目标 Playwright 12/12 等局部检查通过，但 `npm run format:check` 因 forensic Markdown 失败；因此整合候选为 **QA_FAILED**，不应纳入已验收功能。

第二轮将补足候选分支可组合性、安全问题、剩余工作和最终结论。

## 第二轮：疑点核实、整合与安全结论

### A. 总览

“功能点总数”是本审计为便于逐项判定而从原始任务 scope/验收拆出的最小可核验单元（即上表的行数），并不是主观完成百分比。`已通过 QA` 仅统计有明确历史切片 QA 的行；`正式验收` 只统计本审计认可的完整原始功能单元，不能由父任务勾选倒推。

| Task | 功能点 | ACCEPTED | IMPLEMENTED | PARTIAL | SCAFFOLDED/STUB | MISSING | BLOCKED | 有历史 QA | 正式验收 | 判断摘要 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| T01 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 3 | 3 | 合约、BigInt 与货币 DOM 流程闭环。 |
| T02 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 3 | 0 | 服务可用实现与历史切片证据存在；本轮未重跑 PG/端到端。 |
| T03 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 3 | 0 | Rust 本地认证边界存在；真实多账户/撤销不在已证明闭环。 |
| T04 | 4 | 0 | 1 | 2 | 0 | 0 | 1 | 2 | 0 | 本地 Seed 可用，完整管理、发布、授权部署和组合验证未完成。 |
| T05 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 3 | 0 | 本地目录和裁剪已做；本轮不将历史切片重命名为总验收。 |
| T06 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 3 | 0 | 本地草稿/提交闭环；不包含真实附件摄取与打印。 |
| T07 | 3 | 0 | 2 | 1 | 0 | 0 | 0 | 2 | 0 | 工作流/策略/评论可见；提及与通知投递未形成闭环。 |
| T08 | 4 | 0 | 3 | 0 | 0 | 0 | 1 | 4（切片） | 0 | 采购执行骨架和局部业务存在；正式发单候选未整合。 |
| T09 | 4 | 0 | 1 | 2 | 1 | 0 | 1 | 3（切片） | 0 | 收货/关闭局部存在；付款仅候选，附件只是表结构。 |
| T10 | 6 | 0 | 1 | 3 | 1 | 1 | 1 | 4（切片） | 0 | Push/Pull/冲突基础存在；运行时、隔离、安全、WebSocket 与全实体投影没有可执行总闭环。 |

### 候选树与 Multi-Agent Workflow 核查

已读取 `.agents/workflows/multi-agent-workflow/*`、`docs/agent-coordination/DEV_HANDOFF.md`、`BUG_QUEUE.md` 和 QA 报告。协作记录相对于代码的结论如下：

| 候选 | 已有代码/证据 | 实际状态 | 为什么不能算主线功能 |
|---|---|---|---|
| `74365f0` / `codex/t04-unit-management` | 项目/站点/部门/团队/单位/税/汇率的投影和 Pull 发布提交链 | 可审的独立切片，T04-001 修复在 `2fa32d0` 通过局部 QA | 未合并到 `main`；真实授权部署 T04-A/B/C 未做。 |
| `6a006ed` / `codex/t08-formal-execution` | `0044_local_formal_issue.sql`、本地 OPA 冻结签发 | 本地切片 QA 通过 | 不是 `main`；与同步/付款迁移的最终链未交付。 |
| `cbc129a` / `codex/t09-receipt-payment` | 付款追加记录、凭证提醒、Owner 拒绝和 outbox | 仅本地切片 QA 通过 | `INT-002` 明确未解决：服务端 schema/投影/Pull 不存在。 |
| `c3bf374` | 处理 `0044`/`0045` SQLite 命名冲突 | 独立整合 QA 通过 | 只解决桌面迁移名称，不等于付款/正式单完整同步。 |
| `5d93369` | 合并 RFQ/桌面同步候选至 `0047` | 代码冲突已解，但 QA 记录为 **FAILED** | `docs/qa/2026-10-16-desktop-integration-5d93369.md` 记录 `npm run format:check` 失败；而且尚未与 P1 组合。 |
| `077148b` | 只修复上述 forensic Markdown 格式 | 局部格式补丁 | 不能解决 P1 的七文件服务端语义冲突或证明组合测试。 |
| `e37902f` / `8e20a48` | 服务端 formal issue 注册、碰撞/冲突与 Pull 检查点 | server QA 切片通过 | 桌面 OPA Push/Pull、双客户端和汇率出处未完成。 |
| `514747d` | 迁移 `005_sync_event_origin.sql`，事件/冲突源绑定和 legacy quarantine | P1 standalone server QA 通过 | 未与 `5d93369` 形成干净最终树；没有 Tauri A/B HTTP 证明。 |
| `c82fd62` | 尝试将 P1 合进桌面候选 | **不可执行工作树** | `git status` 显示 seven-file server/doc unresolved conflict 和新增未提交 formal 文件；不能作为版本。 |
| `70bd54d` | 协调检查点、QA/缺陷记录 | 文档线 | 它不是 `5d93369`、`514747d` 或 `c82fd62` 的祖先，未含它们的应用代码。 |

### C. 未实现、框架或半成品清单

以下为必须补齐的具体工作，而不是“继续完善”的泛泛表述。

1. **T04 实际初始化与管理闭环 — BLOCKED/PARTIAL。** 通过获得授权的部署账户和窗口，使用 `seed/master-data.json` 的现有受信任 seed 路径写入实际批准记录；随后在部署环境核验不可变代码、项目—国家—站点绑定、默认语言/币种/税/地址/联系人。将候选 `0040–0043`、完整单位/税/汇率 UI 与服务端投影作一次干净集成，并对 REST→outbox→Push→cursor Pull 做账户范围和并发回归。
2. **T07 提及和通知投递 — PARTIAL。** 在现有不可变 `local_order_comments` 基础上，定义并验证 `@account` 提及解析、授权的收件人选择、通知记录创建/读取/已读状态；禁止把不存在或无权账户作为收件人。现在的 `0009_order_notifications.sql` 不能证明这些行为发生。
3. **T08 正式签发 — BLOCKED。** 整合 `0044_local_formal_issue.sql` 后，在一个事务中生成并冻结 OPA/HPA/SPO 的本地号、安装 UUID/序列、完整报价/汇率/markup 快照及 outbox；恢复/冲突后不可变。签发后的预览/PDF 脱敏仍依赖 T12，不能由页面显示替代。
4. **T08 Honsen 正式执行 — PARTIAL。** 补齐市场直采与 supplier-child 两路径的 HPA/SPO 正式文档、状态转换限制、发送后冻结，以及跨供应商/币种校验；将现有 RFQ/分配/条款面板接入此已签发状态，而不只停留在本地子订单操作。
5. **T09 多批收货/付款/关闭 — PARTIAL。** 对每一行维护累计数量、批次单位/日期/收货人；超收必须要求并保存理由。整合 `0045_procurement_expenditures.sql`，让每笔 Honsen 付款都以追加记录和可选凭证警告保存，禁止 Owner 路径付款；通过服务端事件 schema、Push/Pull 把它同步。关闭后必须在所有 parent/market/child 写入口拒绝修改和删除。
6. **T09 附件 — SCAFFOLDED。** `0015_receipt_attachment_links.sql` 仅是链接。按 T11 边界实现受限文件摄取、最多十张照片、压缩、MIME/大小校验、可恢复上传和归档读取，然后做 receipt-to-attachment 集成证明；目前不能声称收货照片功能存在。
7. **T10 全实体同步投影 — PARTIAL。** 扩展 `apply_sync_pull_page`、server `PostgresSyncStore` 与共享事件 schema，覆盖正式单、子订单、RFQ、付款、收货和附件；每类需要版本/软删除/账户范围、不覆盖历史冻结快照、重复 Push 幂等和失败重试测试。
8. **T10 桌面运行时同步 — PARTIAL。** 将 `sync-lifecycle.ts` 的登录 Push→Pull、变更后同步、有限重试/指数退避、网络恢复、可见同步状态接到真实 Tauri 会话而不是仅候选/模拟 IPC；保证离线/锁定/失败会话不会发请求，并且仅在 server ack 后显示已同步。
9. **T10 WebSocket — MISSING（桌面）。** 服务端 hint 路由已有；补一个认证桌面客户端，监听断线重连、把 hint 视为仅触发 cursor Pull、并测试漏掉 hint 后下一次 Pull 仍恢复。不得把 WebSocket 作为数据真相通道。
10. **T10 P1/T10-SEC-001 — BLOCKED。** 以一名整合负责人把 `5d93369`/`077148b` 与 `514747d` 的七个重叠服务端文件测试优先地合并，解决迁移号/历史 origin 的语义；生成无冲突 SHA，运行 `0044→0047` 加 P1 迁移，并做两名账户/两安装 UUID 的真实 Tauri→HTTP→PostgreSQL Push/Pull/冲突/旧令牌撤销测试。旧 `legacy_unverified` 事件必须隔离，不能投影到其他账户。
11. **T10 formal snapshot 组合验证 — BLOCKED。** 将 OPA 正式号/快照从桌面 outbox 写入服务端 registry，复现重复正式号和不同快照同号，断言服务端写审计冲突且本地冻结字段不变；再以 catalog/汇率撤销 Pull 证明不会回写历史快照。

### D. 已实现但尚未验收

| 类别 | 已有实现 | 未验收原因 | 需要的证据 |
|---|---|---|---|
| 测试缺失/不足 | T07 评论工作流、T08 OPA 本地定价、T09 收货关闭、T10 Push/Pull/冲突 | 现有 DOM 常使用 fixture 或 mocked IPC；本轮未见原生跨账户闭环 | 隔离真实 Tauri profile 的角色切换、SQLite 断言和 API/PG 集成。 |
| 环境/授权阻塞 | T04 seed 的真实初始数据 | 没有部署账户/批准窗口；不得用虚构数据替代 | 授权后保存的非敏感部署证据和回读核验。 |
| 集成冲突 | T08/T09 迁移、T10 账户隔离/P1 | `c82fd62` 未解决冲突，`5d93369` QA 格式失败，候选彼此非线性 | 一个干净的合并 SHA、格式/类型/Rust/API/PG/DOM 回归。 |
| 外部依赖 | T09 附件 | T11 定义文件摄取/归档，当前只存在 metadata link | T11 完成后的 joint receipt-attachment proof。 |
| 真实多设备/撤销 | T10 生命周期、WebSocket、P1 | QA 已明确没有 native A/B HTTP、线上撤销、missed hint 证明 | 两安装 profile 与 disposable PostgreSQL 的可重复运行记录。 |

### E. 代码回归及安全问题

| 严重度 | 问题 | 复现/代码证据 | 影响与最小修复 |
|---|---|---|---|
| **P1 / High** | `T10-SEC-001`：同步事件/冲突历史来源没有可组合的账户/安装实例来源绑定。 | `docs/agent-coordination/BUG_QUEUE.md` 的 `T10-SEC-001`：`514747d` 单独增加 `005_sync_event_origin.sql` 的 `origin_account_id`、`origin_installation_id`、`origin_status` 和 quarantine；但其与 `5d93369` 七文件冲突，且没有 native A/B HTTP 组合测试。 | 在现有状态下不能证明某账户的事件、冲突或 Pull 结果不会泄露给另一个账户/设备。按上节第 10 项合并并进行双账户回归；在完成前不得作为安全同步版本发布。 |
| **High** | 当前主线没有正式签发/付款候选的迁移链，却有相关执行 UI/命令。 | `main@5139cc8` 最高迁移为 `0031`；正式签发/付款位于其他 worktree 的 `0044`/`0045`。 | 用户可走到局部执行，却不能获得原要求的持久正式单/付款同步闭环。先整合迁移和命令，后开放相应 UI 路径。 |
| **High** | “已整合”的 server candidate 不可构建为可审计版本。 | `git -C …/t08-t10-p1-server-integration status --short` 显示 `UU` 冲突，含 `postgres-store.ts`、`api.test.ts` 与文档。 | 不可把 `c82fd62` 作为 release/QA 基线；创建干净合并分支并从零跑受影响测试。 |
| **Medium** | WebSocket 只有服务端，不存在桌面消费端。 | `apps/server/src/app.ts:272-292` 注册 route；对 `apps/desktop/src` 搜索未发现 `WebSocket`/客户端。QA `T10-GAP-002` 同结论。 | 线上改动不会及时触发 Pull；离线恢复只能依赖缺失的生命周期。实现 hint client + cursor recovery，不用 websocket 传业务数据。 |
| **Medium** | 收货附件被表结构误导为文件功能。 | `0015_receipt_attachment_links.sql` 与 Rust migration test 仅证表；没有主线 upload/compress/archive 服务。 | 不能保存收货证据文件；通过 T11 实现真正摄取/限制/归档。 |
| **Medium** | T07 需求含 mentions/notifications，但未发现行为实现。 | 全树对 `mention` 仅命中工具/无业务实现；`0009_order_notifications.sql` 不是投递闭环。 | 评论只会留本地记录，相关人不会收到可追踪通知；补充明确 recipients 与测试。 |

### F. 剩余工作量与建议 Owner

规模是粗略的相对工作量（S/M/L/XL），不是完成百分比或日期承诺。

| 优先级 | 工作项 | 依赖 | 建议 Owner | 规模 |
|---|---|---|---|---|
| P0 | 合并并验证 T10-SEC-001，生成清洁候选树 | `5d93369`、`077148b`、`514747d` | 单一 integration owner + QA | L |
| P0 | native 双账户/旧令牌/冲突/历史隔离验证 | P1 clean SHA、disposable PG | Desktop sync + QA | L |
| P0 | T04 授权真实初始化 | 产品/部署授权 | Product owner + deployment admin | M（外部依赖为主） |
| P1 | 整合 T08 formal issue 和 T09 payments，完成正式文档/付款 server projection | P0 迁移规划、T08/T09 candidate | Procurement domain owner | XL |
| P1 | 全实体 Push/Pull（RFQ/child/receipt/payment/attachment metadata） | 正式单/付款模型固定 | Sync owner | XL |
| P1 | 桌面 sync lifecycle + WebSocket hint/reconnect | clean T10 tree | Desktop sync owner | M |
| P1 | T09 多批收货和 closed immutability 全路径回归 | 正式 execution route | Receiving/payments owner | M |
| P2 | T07 mention/notification delivery | identity/authorization snapshot | Workflow owner | M |
| P2 | T09/T11 文件归档联合闭环 | T11 attachment service | Attachment owner | L |
| P2 | T12 PDF/打印/导出与 Owner 脱敏 | 正式冻结 snapshot | Documents owner | L |

### G. 最终结论

1. **真正完整可用的功能**：T01 的共享金额/数量/格式化合同是唯一可在本审计标准下称为完整闭环的 T01–T10 原始功能单元。T02、T03、T05、T06 的本地切片已有真实代码和历史测试证据，日常本地演示可用，但本轮未以当前主线重新执行全部质量门，故不把它们扩大称为整任务/生产验收。
2. **框架或半成品**：T04 的完整主数据管理与发布、T07 的提及/通知、T08 的正式签发与两种执行路径、T09 的收货/付款/附件、T10 的生命周期、WebSocket 和全实体同步都不是完整产品闭环。尤其附件目前只有关联表。
3. **根本没有实现的功能**：桌面 WebSocket hint 客户端、提及/通知投递、T09 附件摄取/压缩/归档、PDF/打印/Excel（T12 依赖但也是 T08 原始签发体验无法闭环的部分）在受审范围内未发现可运行实现。
4. **已实现但未验收的功能**：候选中的 OPA formal issue、付款、RFQ Pull、桌面 sync lifecycle、账户 Pull 隔离和 P1 origin binding 都有局部 QA，但没有一个干净的组合 SHA 与本机双账户/服务端验证；`5d93369` 还保留格式失败，`c82fd62` 处于冲突状态。
5. **严重安全/一致性风险**：最高风险为 `T10-SEC-001` 的跨账户/安装来源隔离尚未在组合树验证；其次是正式号码/冻结快照/付款的迁移和同步分散在未合并分支。把它们分别测试通过误认为一个发布版本，会造成权限隔离与历史不变性无法证明。
6. **现在启动 `main@5139cc8` 能完整走通的实际流程**：本地登录/离线认证、受限的目录维护、创建草稿、精确计算、提交、基本审批/评论、RFQ/分配/条款、部分收货及本地基础 Push/Pull/冲突界面可走局部路径。不能完整走通“离线正式发单 → 服务器注册 → 多账户/多设备安全同步 → 多次付款/收货附件 → 打印导出”的 PRD 主流程。
7. **T01–T10 正式验收前的具体任务**：先完成 P1 clean integration 与 native A/B 数据隔离验证；获得并执行 T04 授权初始化；完成正式单、付款、全实体同步和迁移链；实现 desktop lifecycle/WebSocket；完成收货/附件边界；补齐 mention/notification；对所有任务执行不跳过的格式、lint、typecheck、单元、Rust、API/PostgreSQL、真实 DOM/native 流程并保存证据。随后才可复核 T01–T10 的原始验收表。

## 本轮验证与未检查项

- 本轮实际执行的是 Git 图/差异/worktree 状态、源码/迁移/测试索引和 QA 记录的只读核查；未运行全量测试、未启动 Docker、未启动真实 Tauri，也没有读取或清理任何用户 E2E 数据。
- 所有“通过”均明确为既有记录或局部候选证据，不构成对 `main` 或任一冲突候选的当前可运行性声明。
