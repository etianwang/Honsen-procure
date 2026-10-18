# T10 总验收差距审计

日期：2026-10-18（UTC / Atlantic-Reykjavik）。角色：独立 QA / Integration Auditor。

## 结论与计量口径

**T10 尚未达到总验收条件。NATIVE-008 保持 CLOSED；T10-SEC-001、P1、Formal hold 保持 OPEN。**

按本报告从原始要求拆出的 30 项验收条件，现有证据支持 **12 PASS、12 PARTIAL、4 MISSING、2 BLOCKED**。严格已证明比例为 **12/30（40%）**，只描述本矩阵的证据覆盖，不是代码完成率；PARTIAL 不折算为通过。原始 T10-A～F 六个完整验收包仍是 **0/6 完整关闭**。这不否定 NATIVE-002～008 已通过的有界原生可靠性场景。

剩余工作归为 **12 个必需闭环验收包**，另有 1 项不阻塞的 P2 记录完善。推荐下一项是整合已有 `031ad67` 的冲突来源保护并独立验证，避免重复开发。此处的数量是按可验收结果分组，不是提交数量、工时估计或对未知缺陷的上限承诺。

本轮只读取代码、Git、历史报告和已有 JSON/JSONL/测试日志，新增本报告。没有运行新的业务测试，报告中的 PASS 都明确引用已有执行证据；没有把本轮静态审查写成新鲜测试通过。生产代码、既有证据及状态登记文件未修改。

## 1. 审计基线与交付边界

| 对象                   | 实际值 / 核实结果                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 审计工作树             | `C:\Users\This PC\.codex\worktrees\native008-recheck\Honsen materials`                                                                                                                                                         |
| 分支 / 审计起始 HEAD   | `codex/qa-native008-recheck` / `be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95`                                                                                                                                                      |
| 被测修复               | `03f432ab102b42d2b41e5b2a546b57c5e74f7762`，为审计 HEAD 祖先；NATIVE-008 的独立最终文档提交为 `be20d76`                                                                                                                        |
| 已包含的关键实现       | `8293ed5`（T08/T10/P1 服务端整合）、`514747d`（可信 session origin）、`e37902f`（审批来源/删除保护）、`6a006ed`（本地 OPA 签发）、`0a42ebe`（账号 Pull 状态）、`23c9d73`（RFQ 兼容）；均执行过 `merge-base --is-ancestor` 核对 |
| 调用方 E: 工作树       | `E:\Project\Honsen materials`，`codex/t04-unit-management`，HEAD `74365f0f39032d4b768d8bc4c397b626221820f1`；与审计 HEAD 不同                                                                                                  |
| 获取后的 `origin/main` | `5139cc8f7d5a70cddb80b3ce5665100a316c9656`；审计 HEAD 不在其中。所列关键实现提交均不是 main 祖先；同时核对了相关源代码差异，不能把审计分支能力称作 main 已交付能力                                                             |
| 原有未跟踪文件         | 审计树只有 `.honsen-native-qa/`；E: 树有 `.honsen-e2e/` 和 `apps/desktop/src-tauri/.honsen-native-e2e/`，全部保留                                                                                                              |
| 环境                   | 审计期间 C: 可用空间约 0.67 GiB；本轮没有构建空间需求，不能据此宣称后续构建环境充足                                                                                                                                            |

读取了 `AGENTS.md`、`memory.md`、`QA_REPORT.md`、`BUG_QUEUE.md`，以及 PRD、SPECS、ARCHITECTURE、DATABASE、SECURITY、SYNC-PROTOCOL、TEST-RULES、BUILD-TASKS、ROADMAP、PARENT-ACCEPTANCE-COORDINATION。没有变更 Toolbox 契约，因此未发起应用/发行修改流程。

相关工作树的只读核对：

| 工作树 / HEAD                                                                    | 状态与本轮解释                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `t10-runtime-sync/Honsen materials` / `031ad670b90903c280f7b01567e7d6753bd8a3c9` | 干净；该 tip **未包含于审计 HEAD**。其 resolver owner 保护确实不在审计代码中，详见 F1                  |
| `p1-auth-event-origin/Honsen materials` / `514747d`                              | 干净；实现已包含于审计树，不能继续把可信 origin 的服务端实现列为完全缺失                               |
| `t08-formal-execution/Honsen materials` / `6a006ed`                              | 干净；本地 OPA 实现已包含，业务总验收仍未完成                                                          |
| `t08-t10-p1-server-integration/Honsen materials` / `b203c70`                     | 干净；整合已包含，有独立服务端 92/92、组合 57/57 历史证据                                              |
| `t08-t10-desktop-integration-resolve/Honsen materials` / `077148b`               | 干净；tip 不在审计祖先链中。该 tip 为文档格式提交，不能仅凭 tip 缺失推断整合代码全部缺失               |
| `t09-receipt-payment/Honsen materials` / `cbc129a`                               | 干净；tip 不在祖先链中，但本地 expenditure 服务及迁移在审计树实际存在（经整合/重放），其同步契约仍缺失 |

其余已注册 worktree 清单已通过 `git worktree list --porcelain` 阅读；没有修改、合并、删除任何工作树。Git 祖先关系和实际符号/代码差异联合使用，避免把 squash/replay 当作完全未实现，也避免把别的分支结果算作本树通过。

## 2. 原始要求索引

下列引用均为审计 HEAD 中的仓库文件；本文的 R 编号不是新增产品要求。

| 编号 | 原始要求及出处                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1   | `docs/PRD.md` §6、§8：普通业务 SQLite 离线操作、恢复后同步、增量更新、并发冲突不静默丢失；`AGENTS.md` 非协商规则 3、6                                                                                              |
| R2   | `docs/BUILD-TASKS.md:61`、`:179`～`:189`：T10 原范围、A～F、原依赖 T04～T09；`:95` 明确 parent 未完成；`docs/ROADMAP.md:66`～`:69` 的 M3/T10 状态                                                                  |
| R3   | `docs/SYNC-PROTOCOL.md` Guarantees/Push/Pull/Retry：业务与 outbox 原子提交、ACK 后确认、100 事件部分结果、幂等、Cursor 与投影事务、失败重试、拒绝保留和错误分类                                                    |
| R4   | 同文件 Conflict handling 与 `docs/ARCHITECTURE.md` Conflict policy：保留双份草稿/数据；管理员显式选择；新事件基于选定权威版本；历史冲突不可变；订单修订不能直接覆盖正式件                                          |
| R5   | `docs/SECURITY.md` Access model/Data and network/Security tests：账号可信身份、installation 不是凭证、角色/项目边界、停用/撤销拒绝、离线窗口、单在线 session；`BUILD-TASKS.md:181`～`:185` 的 T10-SEC-001 原关闭项 |
| R6   | `SYNC-PROTOCOL.md` WebSocket、`PRD.md` §6、`BUILD-TASKS.md:186`：桌面订阅 hint、失效 session 断开/锁定、漏 hint 以 Cursor Pull 恢复                                                                                |
| R7   | `PRD.md` §4～5；`SPECS.md` owner issue；`DATABASE.md` Data invariants/numbering；`SYNC-PROTOCOL.md` formal Push/conflict：离线冻结编号/报价/金额/汇率、云端注册而非重编号、碰撞审计、后续同步不重写                |
| R8   | `TEST-RULES.md` T05～T09、T15～T20、T28～T32、T45～T46、T48～T50；Required tests 的失败/重试/冲突/克隆/支付验收。注意其中 **T10 测试用例是“删除被订单引用的物料”**，不是 BUILD-TASKS 的整个 T10 项目任务           |
| R9   | `BUILD-TASKS.md` T04-A/B/C、T08-B/C/D、T09-A/B/C/D、T10-F；`PARENT-ACCEPTANCE-COORDINATION.md`：实际授权初始化、完整 formal/receipt/attachment 验收；T09-C/T11 边界需明确，不能用 metadata 替代文件归档            |

“服务端审批”在此指同步接受时服务端独立验证审批与角色，不取消 PRD 明确允许的本地离线签发；离线保存/签发不等同于服务端已接受。本报告不新增“必须在线才可签发”的规则。

## 3. 证据目录与适用范围

证据类型：Unit（含 Rust SQLite/file-SQLite）、Server/Integration（Fastify/PostgreSQL）、DOM（浏览器模拟 IPC）、Native EXE（真实 Windows EXE、生产 Rust 路径、SQLite、OS vault、Fastify HTTPS、隔离 PostgreSQL）。DOM 只能说明交互，不能充当真实原生链路。

| 证据 ID | 测试、SHA 与运行 ID                                                                                                                                                                                                                                                                                              | 独立性 / 本轮读取与业务覆盖                                                                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E0      | 独立服务端 QA：测试 baseline `b203c70fd83a5dbcdb01fcaf9184d5b9fa9bbd13`，实现 `8293ed5172f8caa5dd149cec278ea09f0f1a852e`；项目 `honsen-qa-b203c70-20261016`；full 92/92、combination 57/57                                                                                                                       | 独立 QA。读取 QA_REPORT 及原工作树 `test-results/qa-b203c70-server-{full-fresh,combination-57}.log` 的实际通过汇总；是 Server/Integration，使用合成请求，不是 native formal 业务链                                                                                 |
| E1      | Native `ab-login-switch`，实现 `028ed6fbfa9df220010eb0c3271de7e75b7419b9`，记录运行 `native-smoke-20261016173505`                                                                                                                                                                                                | QA_REPORT 有真实 Rust login/session replacement/lock 记录；早于 Windows vault backend 修复 `28441d1`，本轮仅采信为历史窄证据，当前 shared-profile/离线重连安全矩阵仍 PARTIAL                                                                                       |
| E2      | NATIVE-002 `ab-sync-security`；独立测试 SHA `87ab8e5`，运行 `native-smoke-20261017153900`，QA `4d6c755`                                                                                                                                                                                                          | 独立 Native EXE。读取 result JSON；A/B installation 不同，伪造 deviceId 不改变 session origin，真实 `save_requisition_draft`/Push/Pull、保留 1 个冲突。B 是重新保存同 UUID 的 stale draft；**不是两端先 Pull 相同基线再离线修改后完整解决**                        |
| E3      | NATIVE-003 `pull-recovery`；测试 SHA `bc80b09`，运行 `native-smoke-20261017155533`，QA `2b30736`                                                                                                                                                                                                                 | 独立 Native EXE。读取 interrupted/recovered JSON：Cursor 0→0，重启 0→1，再 Pull 0 条；通过真实业务 draft 产生源事件                                                                                                                                                |
| E4      | NATIVE-004 `offline-push-recovery`；测试 SHA `b16f306`，运行 `native-smoke-20261017161819`，QA `bdc26d7`                                                                                                                                                                                                         | 独立 Native EXE。读取断网/恢复 JSON 和 Harness/Rust：在线登录后实际停止 HTTPS endpoint，再调用生产 `save_requisition_draft`，不是直接插 outbox；同 profile/install/event 重启，Outbox 1→0、Pull 1、空 Push replay                                                  |
| E5      | NATIVE-005 `push-partial-batch`；测试 SHA `ae1bfc9`，运行 `native-smoke-20261017162947`，QA `4c75f6c`                                                                                                                                                                                                            | 独立 Native EXE。读取 JSON：同批 accepted/conflict；只 ACK accepted，保留 pending=1/conflict=1，Pull 2，replay accepted=0/pending=1；不包含 validation_error 的完整用户处理                                                                                        |
| E6      | NATIVE-006 `pull-page-recovery`；测试 SHA `1a5d719`，运行 `native-smoke-20261018112034`，QA `a2d4f65`                                                                                                                                                                                                            | 独立 Native EXE。读取 interrupted/recovered JSON：500 条已提交、第二页 503、重启再取 1 条、最终 501、replay 0；源数据由生产 drafts/Push 产生                                                                                                                       |
| E7      | NATIVE-007 `cursor-write-recovery`；测试 SHA `c90480f`，运行 `native-smoke-20261018114610`，QA `6d9a061`                                                                                                                                                                                                         | 独立 Native EXE。读取 fault/recovered JSON：Cursor 写入前注入 NOT NULL 失败，faultTriggered=true、投影/Cursor 0/0；同 profile 新 EXE 恢复 1/1，replay 0。此为**事务内故障**，不等于事务中途进程强杀                                                                |
| E8      | NATIVE-008 `push-termination-recovery`；被测 `03f432ab102b42d2b41e5b2a546b57c5e74f7762`，独立 QA `be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95`；A `native-smoke-20261018151230`/PID 29296；B `native-smoke-20261018151430`/PID 30068                                                                                | 独立 Native EXE；最终复核已读取 JSON/JSONL。A socket-close 15:12:45.958Z 在 release .985Z 前、handler=false、PG 0/0/0→1/1/1；B .647Z 在 .677Z 前、handler=true、PG 1/1/1 不变；Outbox 1→0/Pull 1/replay 0。是 Push 前/后提交强杀，不能扩大到所有业务链或所有故障点 |
| E9      | 审计 baseline 内 Rust tests：`owner_pricing_requires_a_catalog_or_audited_manual_quote_and_freezes_the_result`、`pull_page_advances_cursor_atomically_and_preserves_local_conflicts`、账号 Cursor/owner/迁移/离线 command tests、RFQ projector tests；最近独立 final QA 在 `03f432a` 为 `cargo test --lib` 55/55 | 历史独立命令证据在 QA_REPORT/memory；本轮核对测试源码，不重跑。Unit/file-SQLite 的业务命令可证明对应局部不变量，但有直接 SQL fixtures，不能视为 native 工作流                                                                                                      |
| E10     | `apps/desktop/src/lib/sync-lifecycle.test.ts`；`tests/e2e/sync-lifecycle.spec.ts`；`navigation.spec.ts` 的 conflict control 和 owner issue 测试；runtime 实现 `2980d68`/其来源 `4fe174f`，文档记录历史 Vitest/DOM gates                                                                                          | Builder 历史开发证据，部分后来整合；不是本轮运行 ID。DOM IPC 为模拟；conflict fixture 的 resolve 是空实现，不能证明可信 resolver、PG 新版本或双端收敛                                                                                                              |
| E11     | Server tests `formal-issue.test.ts`、`formal-issue-hardening.test.ts`、`formal-issue-migration.test.ts`；origin tests `postgres-store.test.ts`/`service.test.ts`；审批实现 `4b7dd54`/`e37902f`，origin `514747d`，由 E0 独立组合复核                                                                             | 独立 Server/Integration 证据覆盖 exact approved snapshot、不同 approver、工程师拒绝、软删除不复活、正式字段/状态不变、编号/namespace 冲突、回滚和重试；没有真实 EXE formal 全链证据                                                                                |
| E12     | 未集成修复 `031ad670b90903c280f7b01567e7d6753bd8a3c9`；新增 `conflict_resolution_never_changes_another_accounts_or_legacy_event_owner`；源树 memory 记 Rust 42/42、DOM 36/36                                                                                                                                     | Builder 来源分支证据；已读取 commit diff/源树交接，但未在审计树独立执行，**不计审计树 PASS**                                                                                                                                                                       |

E2～E7 的 JSON 原件在 `C:\Users\This PC\.codex\worktrees\qa-b203c70\Honsen materials\.honsen-native-qa\`，本轮实际只读解析了表内 run 对应结果。E8 原件在审计树 `.honsen-native-qa/`；每次 run 的 `*-server-sync.test.jsonl` 保存 HTTPS、取消、权威 PG 快照。PG 三元组为 `eventCount/eventVersion/entityVersion`。SQLite 原件均未修改；没有复制或删除证据。E0 与 E1 的运行日期/源码边界与最新 HEAD 不同，本报告没有把它们描述为最新 HEAD 的全套重跑。

## 4. 逐项验收矩阵

实现位置缩写：Rust=`apps/desktop/src-tauri/src/lib.rs`，Native=`apps/desktop/src-tauri/src/main.rs`，Server=`apps/server/src/sync/`，Shared=`packages/shared/src/sync.ts`。每行测试 SHA、运行 ID、类型、独立性与业务覆盖由所引 E 编号明确给出。

PASS 只适用于该行文字限定的条件；PARTIAL=已有实现/局部证据但完整业务验收不足；MISSING=没有该完整结果的证据；BLOCKED=必须先解决依赖/授权/恢复规则。静态确定的实质缺陷另外在 §5 描述，不能因行状态为 PARTIAL 被忽略。

| ID  | 原始条件及出处                                                        | 实现位置 / 已有测试证据                                                       | 状态    | 剩余缺口                                                                                                        |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| A1  | 断网后创建真实采购草稿（R1/R8 T06）                                   | Rust `save_requisition_draft`/`save_requisition`；Native offline mode；E4     | PASS    | 通过范围是草稿创建，不延伸到全部业务实体                                                                        |
| A2  | 离线修改已有采购数据并恢复（R1/R4）                                   | Rust `save_requisition`/revision；E9/E10；E4 只新建                           | PARTIAL | 无同一已存在云端基线的真实离线 edit→restart→同步证据                                                            |
| A3  | 本地业务、快照、outbox 同事务持久化（R3/R8 T05）                      | Rust `save_requisition`、`insert_local_sync_outbox`；E4/E9                    | PASS    | 已证明局部采购 draft 和对应 Rust 事务；新增实体仍须自身验收                                                     |
| A4  | EXE 重启保留草稿及原 pending event（R3/R8 T08）                       | Native recovery；E4/E8                                                        | PASS    | 同 profile/install/event 已有独立原件                                                                           |
| A5  | 恢复连接 Push ACK 后清 Outbox，并 Pull（R1/R3）                       | Rust `push_pending_https`/`pull_sync_https`；E4/E8                            | PASS    | 已覆盖有界草稿恢复                                                                                              |
| A6  | 正常界面的离线登录、修改、状态和恢复自动调度（R1/R5）                 | App、sync-lifecycle、trusted offline guard；E9/E10                            | PARTIAL | E4 是在线认证后断网，不能替代离线启动后真实 UI+账号守卫/重连完整链                                              |
| B1  | 两个不同 installation 从同一云版本离线修改同采购单（R1/R4/R8）        | Native ab-sync-security，E2；Rust optimistic versions                         | PARTIAL | E2 B 构造同 UUID stale draft，没有双端同步基线→各自离线 edit 的完整证据                                         |
| B2  | 有界 stale Push/Pull 保留双方内容并记录冲突（R3/R4）                  | Rust `apply_sync_pull_page_for_account`，Server store；E2/E5/E9               | PASS    | 证明记录/保留，不代表已解决                                                                                     |
| B3  | 用户在正常路由可看懂、追踪 local/server 冲突（R4/T10-D）              | `SyncConflictPanel.tsx`、App、`SyncConflictFixturePage`；E10                  | PARTIAL | Panel 仅 fixture 挂载，不展示双方字段差异；真实生产入口及审计查询未闭环                                         |
| B4  | 用户明确解决 draft-order 冲突（R4）                                   | Rust `resolve_sync_conflict`/`is_directly_resolvable_sync_entity`             | MISSING | 允许列表排除 purchase_order，未找到可替代的完整订单冲突修订解决流程证据                                         |
| B5  | 解决后生成权威新版本，两个 installation Pull 最终一致（R4/T10-E）     | Catalog resolver 局部 Unit，E9；E2 到记录冲突即止                             | MISSING | 缺真实选择→新 outbox→PG version+1→双方业务读模型一致的闭环                                                      |
| B6  | 价格并发、删除/更新冲突可选择且不静默丢失（R4/R8 T09）                | Server optimistic conflict、Rust catalog resolver Unit；E0/E9/E10             | PARTIAL | 缺正常生产 UI/Native 的 keep-local/use-server/tombstone 和最终一致证据                                          |
| C1  | session 可信账号/installation，伪造 deviceId 无效（R5）               | Auth store/service + Server SyncService；E0/E2/E11                            | PASS    | session 绑定已实现且已有独立 native 来源证据                                                                    |
| C2  | 同原 event ID 幂等，不重复提交（R3/R8 T07）                           | Server `PostgresSyncStore.pushEvent`，E0/E2/E8                                | PASS    | 正式业务全链另见 D6，不能借此全部接受                                                                           |
| C3  | 同批 accepted/conflict 只确认成功项（R3）                             | Rust ACK、Server batch，E5                                                    | PASS    | validation_error 分类不在此行通过范围                                                                           |
| C4  | Pull 投影与账户 Cursor 同一 SQLite 事务（R3/R8 T15）                  | Rust `apply_sync_pull_page_for_account`，E7/E9                                | PASS    | 故障写入已证明事务回滚；业务 projector 完整性另见 C11/D4                                                        |
| C5  | 分页 Pull/503/同 Cursor 重启/replay（R3）                             | Rust paged Pull；E3/E6                                                        | PASS    | 501 事件、500/1 边界有独立原件                                                                                  |
| C6  | 提交后响应丢失、Push 真实 EXE 强杀前/后提交恢复（R3）                 | Native mode + test host 屏障；E2/E8；observer 单测 2/2                        | PASS    | NATIVE-008 CLOSED；不新增“每个任意指令点强杀”的门槛                                                             |
| C7  | 账号切换/离线 token/项目投影/冲突来源隔离（R5/T10-SEC-001）           | Rust session/owner/Cursor、resolver；E1/E2/E9/E12                             | PARTIAL | E12 未集成；shared-profile A-offline→B-login→A-recovery、安全读取及冲突来源完整 native 验证缺失                 |
| C8  | conflict/validation/403/auth/transport 不混淆，不错误重试（R3）       | Rust ACK/HTTPS、sync-lifecycle；E5/E10                                        | PARTIAL | ACK 忽略非 accepted 状态；400/403 被归为 SyncTransport；冲突/拒绝事件仍参与周期 Push，见 F3                     |
| C9  | 桌面 WebSocket/撤销锁定/漏 hint 正确恢复（R5/R6）                     | Server `app.ts` WS 测试；桌面 lifecycle 无 WS；E0/E10                         | MISSING | 无 desktop WS 及 revoked socket disconnect + native 锁定/漏 hint 闭环                                           |
| C10 | 无 owner/legacy origin 的保留与明确审计恢复（R5）                     | SQLite 0046/0047、server `005_sync_event_origin.sql`；E0/E9                   | BLOCKED | fail-closed quarantine 有证据，但 recovery/授权归属规则和可信操作缺失；不能自动归到当前账号                     |
| C11 | 所有既定采购实体可跨端投影/追溯（R2/R3/R9）                           | Rust staged order/RFQ、Server、Shared；E9/E11                                 | PARTIAL | expenditure 未入共享类型；receipt/attachment 无完整 projector，child/RFQ 局部有实现但无完整 native 链；见 F2/F4 |
| D1  | 本地审批/离线签发与服务端接受分离，不能伪造审批（R5/R7）              | Rust approval/issue、Server formal provenance；E9/E11                         | PARTIAL | 服务端有独立局部通过；离线业务→不同 approver→native 注册完整链和权威 self-approval policy 未验收                |
| D2  | unresolved 冲突不能导致不安全正式签发（R4/R7）                        | Rust `issue_owner_formal_order`、Server registerFormalIssue；E11              | PARTIAL | 服务端拒绝不匹配 approved snapshot，但本地签发无 unresolved-conflict gate；缺冲突中本地签发拒绝及原件保留证据   |
| D3  | 本地 OPA 签发原子冻结编号/价格，并拒绝缺失有效汇率（R7）              | Rust `issue_owner_formal_order`、owner pricing test；E9                       | PASS    | 仅本地 Unit/file-SQLite 已证明的 OPA 局部，不能代表 HPA/SPO、打印或跨端                                         |
| D4  | Pull 后完整保留正式编号/来源/汇率/markup/冻结快照（R7/T10-A）         | Rust RemotePurchaseOrderPayload/Line 与 projector；E9 只测 confirmed snapshot | PARTIAL | 当前 DTO/SQL 没有 formal/owner 扩展字段；新设备会出现业务行缺正式数据，见 F2                                    |
| D5  | 历史审批、金额、报价、汇率来源、附件引用可追溯（R7/R9）               | local audit/formal snapshot、server registry；E9/E11                          | PARTIAL | 远端 formal 字段遗漏；汇率 record ID/source/effective 完整来源证明不足；附件还受 T11 阻塞                       |
| D6  | 正式编号 clone/re-key/冲突、改价撤销后双端不重写（R7/R8 T18/T45/T46） | Server formal collision/hardening；E11                                        | MISSING | 有 Server 局部实现，无真实 native OPA/HPA/SPO/clone→登记/冲突→双方最终读取的完整验收证据                        |
| F1  | T04～T09 原依赖及最终整合质量门完整（R2/R9）                          | BUILD-TASKS/ROADMAP/PARENT coordination                                       | BLOCKED | T04 实际初始化授权、T08/T09/T11 边界与原验收未关闭；审计实现未在 main；必须单独完成审批后的整合门               |

## 5. 必须处理的实质缺口

### F1 — P0：已有冲突来源保护未被整合

静态确认：Rust `lib.rs:5283` 只用 conflict ID 取记录，不读取/检查原 outbox owner；`:5291`～`:5307` 可 supersede 原事件，再把 keep-local 新事件 owner 设为当前 actor。NULL-owner legacy 行也缺恢复前置检查。当前 `list_sync_conflicts` 是全体未解决记录，而 `sync_status` 只数当前 owner，二者口径不一致。

最小复现：同一个 SQLite profile 保留账号 A 的 material 冲突或 NULL-owner legacy 冲突；切换管理员 B，直接调用可信 `resolve_sync_conflict(..., keep_local, reason)`；当前实现未设 account boundary，能 supersede 原事件并生成 B-owned 新事件。该问题是**来源/隔离不变量缺失**，不是仅因管理员跨项目查看就断言越权；管理员跨项目权限本身是 PRD 允许的。没有证据表明此路径可给普通 engineer 提权。

最小处理：复用尚未整合的 `031ad67` owner-join/check 和回归测试，处理冲突时保留原 owner，NULL 和 foreign owner fail closed；明确列表可见性与解决权限的约定。其来源分支已验证而审计树缺失，不能将来源分支通过记为本树通过。未经明确委托/恢复设计，不把他人的旧事件当作当前 actor 原始提交。影响：T10-SEC-001/P1、T10-D/E。

### F2 — P0：远端正式文件在 SQLite 业务投影中丢失冻结字段

静态确认：Rust `RemotePurchaseOrderPayload` (`lib.rs:681`) 与 Line (`:722`) 没有 `documentType/formalDocumentNo/formalInstallationId/formalSequence/formallyIssuedAt/formalSnapshotJson` 和 owner 来源/转换/markup 扩展。projector (`:7384`，INSERT/UPDATE `:7461`) 只写旧字段；而验证器允许 `workflowStatus=formally_issued`。Serde 默认忽略这些未知扩展，完整 JSON 虽保存在 staging，正常查询的业务表不具备对应完整正式快照。已有 confirmed 行还会提前返回，不能把后来正式签发投影完整。

最小复现：服务端接受合法 OPA；另一安装先得到所有依赖，再 Pull 该 formally_issued 记录；检查本地业务查询返回的 formal number、formal snapshot 与 owner source/rate/markup fields，不能与服务端完整对应。无需覆盖原始 SQLite 才能出现。**不是宣称服务端原件被删或原始已签发端被重新定价**，而是第二端正式资料丢失且 Cursor 可已前进。

最小处理：扩展现有 DTO/验证/投影保留冻结字段；补充从 staging 回放已有记录的恢复验证；已冻结记录对不相等字段应保留审计冲突，不静默替换。必须测全新安装和“先 approved 后 issued”的安装。影响：T10-A/E、Formal，正式资料完整性在修复前不能放行。

### F3 — P1：拒绝结果没有形成可操作的非重试状态

静态确认：`apply_sync_acknowledgements_for_account` (`lib.rs:5122`) 遇非 accepted 直接 continue，未持久保存 validation_error 的操作理由/状态。`push_pending_https` (`:5375`) 把除 401 外的非 2xx（包括 400/403）归为 SyncTransport；lifecycle 仅识别 reauthentication/forbidden/account-boundary，其他错误做网络 backoff，成功周期仍会重新选 pending 冲突/validation 事件。NATIVE-005 证明冲突没丢，**没有证明避免按网络问题自动重试**。

最小复现：服务端对 pending event 返回 validation_error，或请求返回 HTTP 400/403；业务仍 pending，但本地没有明确永久拒绝处理状态，后续周期/网络恢复再次发送。最小修复应保留原 payload 与 event ID，存结构化错误，把传输、权限、版本冲突、输入拒绝分开；修正后的新事件或显式解决再恢复发送。影响：T10-B/D、P1 的可操作错误，不等于已发生数据丢失。

### F4 — P1：本地支出事件会使一个真实 Push 批次整体不合法

`record_procurement_expenditure` (`lib.rs:4195`/`:4323`) 已原子写 `procurement_expenditure` outbox；Shared 的 `syncEntityTypeSchema` (`packages/shared/src/sync.ts:4`) 不包含此类型。生产 Rust 选择稳定前 100 个 pending，含该事件的 HTTP 请求会在共享请求 schema 解析失败，合法邻居也无法获得部分成功结果；再由 F3 归为 transport retry。事件被保留，不应写成已同步。

最小复现：生产命令创建一个合法 Honsen payment，加一个普通合法 draft pending；正常同步批次包含二者；server 请求验证返回 400。所需完整契约/业务表投影/Pull/append-only correction 由 T10 对接 T09，不是增加会计功能。receipt/attachment 的业务投影同样缺完整验收；RFQ/child 有局部 staging 代码，应先验证而非重复实现。影响：T10-A/B/E、T09 接口和 Formal 业务依赖。

### F5 — P1：正式冲突处理和桌面 live revocation 还没有实现闭环

当前 production App 只有 fixture 挂载 `SyncConflictPanel`，fixture 的 `resolveSyncConflict` 为 async 空函数；Panel 本身不显示 local/server 字段比较。Rust 直接 resolver 排除 purchase_order，未见完整订单冲突修订入口。`issue_owner_formal_order` 虽检查 role/scope/status/定价，却未查询 unresolved order conflicts。服务器确有 exact approved-snapshot 拒绝保护，因此不能把本地缺 gate 说成服务器会接受伪造正式件；完整的本地阻止和后续修订仍必须证明。

桌面源代码没有 WebSocket client 接入；服务端 `app.ts:273` 仅在订阅时认证并存 socket，之后 broadcast 没有关联并重新验证 session 或撤销断连。消息仅是 hint，不含订单正文；这里确认的是“撤销 session 必须断开”和桌面锁定验收缺口，不宣称已泄露采购 payload。对应测试必须证明漏 hint、连接断开不影响 Cursor 正确性。影响：T10-C/D/E；Formal 业务验收独立保留。

## 6. 最小剩余工作计划与依赖

只列实现已有需求所必需的闭环。角色“Owner”负责实现与交接，独立 Fixer 负责接受；每个包保留自己的失败证据和检查点，不能用其局部完成关闭 T10 parent。

| 包 / 优先级          | 具体缺口、文件/模块与建议角色                                                                                                        | 前置依赖                                          | 最小验收场景与完成标准                                                                                                                                                                                                            | 阻塞对象                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| G1 / P0（下一项）    | Integration Owner 整合 `031ad67`；Rust resolver、conflict panel/API、来源回归；明确 list/resolve 可见性                              | 本审计基线；先审查既有 commit 与整合差异          | A-owned、NULL-owner 冲突，B 管理员 keep/use 都拒绝且原数据不变；A-owner 管理员正常解决保留 owner；可信命令 Unit + 独立真实 shared-profile 复核                                                                                    | SEC-001、P1、T10-D；Formal 间接              |
| G2 / P0              | Sync Builder 修复正式字段 DTO/validator/projector/staging 回放（Rust、必要 shared contract）                                         | 现有 OPA schema/Server registry                   | 两种客户端起点：空库依赖齐全、先 approved；Pull issued 后编号/完整 snapshot/owner 行逐字段一致；改价/改汇率/冲突 Pull 不重写，失败 Cursor 回滚；Unit→Native 独立证据                                                              | T10-A/E、Formal、P1完整性                    |
| G3 / P1              | Runtime Builder 实现持久拒绝分类和非传输自动重试策略；Rust ACK/HTTP、lifecycle/status/UI                                             | 原 Push contract；不需等待 G2                     | mixed accepted/conflict/validation + 401/403/400/503；只传输失败自动重试，拒绝可见且保留；修正/解决产生合法新事件，无邻居饥饿；原生验证                                                                                           | T10-B/D、P1；SEC 错误隔离                    |
| G4 / P1              | Desktop Builder 将 catalog/reference conflict panel 接生产路由、可信 API、比较和审计；不只 fixture                                   | G1/G3                                             | 真 price/tombstone 冲突，管理员分别 keep-local/use-server，必须原因，保留原 evidence；new base/event 被接受，角色绕过被拒绝；正常 DOM + Native + PG                                                                               | T10-D/E、P1；SEC 来源                        |
| G5 / P1              | Workflow + Sync Owner 补齐 draft-order 显式解决/修订到双端一致；非直接覆盖正式件                                                     | G1/G3/G4；订单修订规则                            | 两 installation Pull 同一 v1，各自断网修改并重启，第一方 v2，第二方冲突；选定结果/修订产生新权威版本，双方最终业务表一致，双方原修改和原因仍可查                                                                                  | T10-D/E、P1；Formal冲突前置                  |
| G6 / P1              | Runtime/Server Owner 接 desktop WS 与 revocation lock，绑定 server socket 会话撤销；现有正常 Pull 复用                               | 现有 session auth + Cursor；G3                    | 两账号/两安装：hint 只触发 Pull；撤销旧 token/socket、旧窗口锁定；丢 hint/断线后启动/周期/重连补全；401 不继续写新 cursor/ACK；真实 EXE/Server 证据                                                                               | T10-C、SEC-001、P1                           |
| G7 / P1              | T09/T10 Owner 完整 expenditure schema、server mutation/audit/projection/Pull，保证提交后 append-only；Shared/Server/Rust             | 已批准 expenditure 接口；T09 domain               | 真实多笔 Honsen payment，和 draft 同批；故障重试不重复；owner 模式拒绝；更正只 reversal/replacement；第二端投影一致；费用与 receipt 独立                                                                                          | T10-A/E、T09/P1；Formal相关闭环              |
| G8 / P1              | T10 integration Owner 补验 child/RFQ，并完成 receipt 的跨端业务投影/依赖/immutable 规则；附件只接 T11 批准接口                       | T08/T09 contracts；先复用已存在 child/RFQ staging | 正常命令 parent→RFQ/child 或 market→partial receipts；第二端按依赖投影；本地 dirty 不覆盖，bad page Cursor 回滚；真实 Native 复核，不能只 sync_entities 计数                                                                      | T10-A/E、P1、Formal关联                      |
| G9 / P1              | Security/Integration Owner 明确并实现 legacy recovery：原账号/安装证明、授权角色、永久审计；SQLite owner 与 server origin quarantine | 需要明确恢复规则，不能猜 owner；G1                | preserved legacy/NULL rows 不丢；未经证明拒绝；有证明的恢复不能更改已接受历史；原账号不存在/禁用路径可操作且留证；Unit/Server/Native                                                                                              | SEC-001、P1；Formal历史归属                  |
| G10 / P1             | Independent Fixer 对 SEC-001 做最终 shared-profile 原生安全矩阵及整合迁移复核                                                        | G1/G3/G6/G9；当前 owner/cursor/scope guards       | A offline mutation→锁→B online，同实体/无权限/旧 token、两账号 Cursor、A 重回；不得改写 A owner、B 不见不该见 payload；含 legacy、异步迟到响应；确认 RFQ 0032 及 0044/0045/0046/0047 集成升级保留，产出新鲜 SQL/HTTPS/SQLite 证据 | SEC-001/P1；不替代 Formal                    |
| G11 / P1             | T08/Formal Owner 完成业务侧 formal：OPA/HPA/SPO、汇率 provenance、本地 unresolved-conflict 拒绝、clone/re-key；T10 对接              | G2/G5/G8；T08 namespace/审批完成                  | 不同 approver 的真实离线 issue→reconnect；无有效 rate 无编号/event；已签发后 catalog/rate revoke 原件不变；重复 number/namespace/divergent snapshot 可审计；所有端完整读取；原始 approval/amount/quote/rate/link 可追溯           | Formal、T08、T10-A/E；P1业务                 |
| G12 / P1（依赖收口） | Integration Owner 联合各 parent Owner 关闭 T04～T09 原验收；解决 T09-C/T11 文件边界和授权初始化；最终集成候选质量门                  | T04-A 授权/窗口；T08/T09/T11 原门；G1～G11        | 部署/合成证据分开；真实附件/归档/不可变引用通过后才能接受该域；所有必需 DOM/API/Native/格式/build gates 在批准的集成候选通过，无跳过被称为 PASS；main 整合另需用户批准                                                            | T10-F、P1/Formal parent；不授权本轮部署/合并 |

已知依赖顺序：G1→G4→G5；G3→G4/G6；G2 与 G1 可分别推进；G7/G8 依赖对应业务 contract；G1/G3/G6/G9→G10；G2/G5/G8+T08→G11；G10/G11 和原 parent 门→G12。安全修复优先于扩大业务流程覆盖。

P2（不阻塞已通过场景）：为现有证据增加一个固定格式的 SHA/run/原生类型/局部边界索引，整理旧文档的状态顺序。不能删历史失败记录。当前 QA_REPORT 在最终 CLOSED 后仍保留历史 READY 段落，BUILD-TASKS 也仍称 RFQ unprojected、singleton Cursor 或 pending counts 未实现；本审计已按当前代码和后续独立记录纠正，未借此重新打开 NATIVE-008 或更改原 parent gate。

## 7. 各 hold 的关闭结论

| 对象        | 当前结论               | 可关闭的必要结果                                                                                                                                                             |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NATIVE-008  | **CLOSED，保留**       | 既定取消语义、单测、A/B、PG 权威快照和必要检查已在独立最终复核通过；本轮没有新增阻塞条件                                                                                     |
| T10-SEC-001 | **OPEN**               | 服务端 origin、账号 Cursor/本地离线守卫与 bounded Native 已有证据；仍须 G1/G9/G10，live revocation 按原安全门由 G6 接受。不能凭 NATIVE-008 关闭                              |
| P1 hold     | **OPEN**               | 除已接受安全局部，还缺冲突解决、跨账号来源闭环、拒绝策略、真正离线多端协作/收敛；至少对应 G1/G3～G6/G9/G10，不能被服务端 suite 替代                                          |
| Formal hold | **OPEN**               | Server registry/provenance/immutability 局部已通过；仍须 G2/G11 和 T08 原业务验收，涉及 receipt/附件的部分还依赖 G8/G12。打印/归档是 T12/T11 所属依赖，不由 T10 技术通过代替 |
| T10 parent  | **OPEN / IN PROGRESS** | A～F 完整条件、G1～G12 及原先依赖门满足；目前 0/6 完整关闭                                                                                                                   |

## 8. 本轮命令、限制与交接

实际只读命令包括：`git status --short`、`git rev-parse HEAD`、`git fetch origin main`、`git worktree list --porcelain`、`git branch --no-merged origin/main`、`git log origin/main..HEAD`、`git merge-base --is-ancestor <SHA> <HEAD/main>`、`git show 031ad67`、`git diff --stat origin/main HEAD -- <相关模块>`、各相关工作树 `git -C <path> status --short`，以及 `rg`/`Get-Content` 定向读源码、JSON/JSONL 和已有测试日志。使用 `Get-PSDrive C` 读取空间。报告提交前执行 `git diff --check`。

本轮没有执行 cargo/npm/native/server suites，因为交付物是只读差距报告，现有测试结果按历史来源列出；没有任何未执行检查被称为本轮 PASS。没有连接业务数据库、独立 HTTP 冒充原生客户端、Mock/Playwright 替代 Native、改 SQLite、清证据、推送、合并或部署。

审计记录 checkpoint 为**包含此新增报告的本地文档提交**，父提交固定为 `be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95`；精确新 SHA 在交付消息给出。报告只产生文档变更，原有 `.honsen-native-qa/` 保留。BLOCKER：本报告列出的未关闭验收门；DEFERRED：下一轮授权后的 G1～G12 实施；WARNING：历史证据不是新候选的整套重跑，main 与审计分支能力不同。完成报告后停止，等待下一轮实施授权。
