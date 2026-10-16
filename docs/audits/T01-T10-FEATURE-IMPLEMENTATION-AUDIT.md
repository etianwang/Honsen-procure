# T01–T10 功能实现独立审计

审计日期：2026-10-16（第一轮检查点）  
审计对象：`main` (`5139cc8`) 及 `git worktree list` 枚举的全部 25 个 worktree。  
性质：只读功能审计；本文件是审计 worktree `codex/t01-t10-feature-audit` 的文档产物，不修改业务代码。

## 审计口径与证据边界

- **代码状态**基于实际源文件、迁移、调用链和已提交测试；不会仅依据任务勾选状态判定完成。
- **验收状态**只承认已提交的 QA/测试记录，且单 worktree 的通过不等于跨分支可执行。此轮没有重跑全量测试，故不会把历史结果表述为本轮新验证。
- `ACCEPTED` 表示此审计的功能点代码闭环且存在相应历史验收证据；`IMPLEMENTED` 表示已实现但验收欠缺；`PARTIAL` 表示业务流缺段；`SCAFFOLDED` 是结构/界面/接口先行；`MISSING` 是未发现实现；`BLOCKED` 指外部或整合阻塞；`UNVERIFIED` 用于未能从本轮证据确认的事实。
- 来源依次包括 `docs/PRD.md`、`docs/SPECS.md`、`docs/ARCHITECTURE.md`、`docs/DATABASE.md`、`docs/SYNC-PROTOCOL.md`、`docs/SECURITY.md`、`docs/TEST-RULES.md`、`docs/ROADMAP.md`、`docs/BUILD-TASKS.md`、`memory.md`、现有 Multi-Agent Workflow、协调/QA 文档和 Git 对象。

## 第一轮：需求追踪矩阵

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
2. 已枚举 25 个 worktree。关键候选：`6a006ed`（本地正式签发）、`cbc129a`（本地付款）、`5d93369`（桌面整合）、`e37902f`（formal server）、`514747d`（P1 origin binding）、`077148b`（格式修复）、`70bd54d`（协调检查点）。
3. `5d93369` 不是 `70bd54d` 的祖先；`514747d` 也不是。`c82fd62` 试图合并 P1，但其 worktree 留有未解决的 server/doc 冲突；不能称为可执行候选。
4. 现存 QA 记录明确：`5d93369` 的 Rust 52/52、目标 Playwright 12/12 等局部检查通过，但 `npm run format:check` 因 forensic Markdown 失败；因此整合候选为 **QA_FAILED**，不应纳入已验收功能。

第二轮将补足候选分支可组合性、安全问题、剩余工作和最终结论。
