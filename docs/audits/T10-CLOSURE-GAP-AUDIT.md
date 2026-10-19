# T10 Closure Gap Audit — Honsen Procure v1.0

## G1-QA-001 修复交接覆盖记录 — 2026-10-19 — READY_FOR_RECHECK

Integration Owner证据，不是独立验收。本轮从QA `bfa6752ccd64a6b39c36bdab96e1cb4c611ada5d`（含G1 `fbdb14b`）在指定工作树建立 `codex/g1-session-invalidation`；实现为包含本记录的检查点，完整SHA见交付。**G1-QA-001 READY_FOR_RECHECK；G1 OPEN，历史独立FAIL不改写为PASS；Q原矩阵/计数保持历史含义。**

- 根因：同步/授权上下文401只返回错误，local_session仍授权读取；accountId不能区分同账号重登。生产改动仅Rust lib.rs：每次在线登录私有随机generation，请求await前捕获身份/token。Connection、在线身份、sticky失效标记共用mutex；匹配401同锁比较→关闭权限→删session行，SQL失败仍关闭。冲突列表/已知ID同锁校验；迟到响应安全boundary，不锁定新B或同账号新session。ACK/Pull/cursor/授权缓存提交也在锁内查generation。合法密码/CAPTCHA重新认证才恢复，不删业务/outbox/冲突/审计。
- 新鲜Rust6/6（观察RED→GREEN）、完整65/65/fmt/release-bin；真实PG G1 3/3、API/service19/19、定向store5/5（34筛选）；屏障3/3、desktop11/11、fixtureDOM2/2、lint/typecheck/build/格式/diff通过。完整命令见QA_REPORT最新段。
- 真实EXE **native-smoke-20261019022252**：另一EXE正常登录撤销当前A后，旧端Pull/列表/已知ID拒绝，denied=true/sourceDisclosed=false；同profile A→B后释放旧Pull req-1p实际HTTP401，B保留自己的完整非空冲突列表和合法Push能力、仍拒绝A；A1→A2后req-28实际401不影响A2本地/在线权限。原恢复/解决/审计/v2/lock/伪造字段断言保留。真实WebView2/Tauri/SQLite/Windows Credential Manager/Fastify HTTPS/隔离PG，无Mock/SQLite写入/HTTP替身。屏障仅测试host，release无新增测试命令；旧NATIVE矩阵未重构。
- **BLOCKER：** QA-001仍须独立Fixer复现；G1生产冲突视图切换/缓存清理证据仍BLOCKED。未改renderer，不宣称真实敏感UI残留验收通过。
- **DEFERRED/security：** 独立授权管理list/change/replace401尚未使用此失效路径，作为首个拒绝仍有生命周期缺口，需另行授权G1/G5复核；不能恢复已被本修复失效的会话。屏障错误run/phase释放的负例单测待补；G2/G3/完整订单解决/正式投影未动。无迁移/协议/依赖/Toolbox契约变更。

旧失败...002730、本轮fixture准备失败...021931和成功...022252原件全部保留；仅移除本轮隔离容器/卷，未清理QA/E2E/业务数据。**NATIVE-008 CLOSED；T10、T10-SEC-001、原始P1、Formal hold OPEN。** 交付后停止，下一授权应为QA-001独立复核。

## G1 独立安全复核覆盖记录 — 2026-10-19 — OPEN / FAIL

本记录优先于下方 READY_FOR_RECHECK 交接；历史 Q 验收矩阵不改写为当前候选 PASS。实际被测应用/执行 HEAD 为 `fbdb14b6afac217688de6cb138514d1bd593cdc8`，父为 `be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95`。QA 分支 `codex/g1-security-recheck`，指定工作树 `E:/Project/honsen-g1-integration`；最终 QA 检查点仅含测试切片及记录，完整 SHA 由交付给出，生产应用 diff 为空。

- 既有 owner 保护未丢失：列表/ID 处理在同一 SQLite 锁内校验角色、当前账号、outbox owner；无 owner/外账号/未知 ID 不可重新归属。独立新鲜 Rust 59/59、真实 PostgreSQL G1 3/3、API/service 19/19、定向 store 5/5（34 筛选）、desktop11/11、fixture DOM2/2 及 lint/typecheck/build/fmt/release 检查通过。它们不替代原生/真实 UI。
- 新增仅测试 G1 原生驱动：真实 debug EXE/WebView2→生产 Tauri IPC、SQLite、Windows Credential Manager、Fastify HTTPS 和隔离 PostgreSQL。账号 B 初始合成 fixture 授予 administrator，避免角色不足掩盖 owner 校验。冲突由真实 `save_material`/Outbox/Push/Pull 生成；无 SQLite 冲突写入、HTTP 客户端冒充 EXE或 Mock IPC。既有 NATIVE002～008 未重构/机械重跑。
- 有界命令场景 `native-smoke-20261019002504` PASS：A→同 profile B→A，B 列表空、已知 ID keep/use 与未知 ID 均 `sync_account_boundary`，伪造身份字段 Tauri 拒绝，B 合法事件成功、foreign-dirty Pull 拒绝，A 原冲突恢复及合法解决至 server v2，显式锁定后拒绝读取/处理。
- **真实反证 G1-QA-001（P1 / BLOCKER）**：最终 `native-smoke-20261019002730` 在另一真实 EXE 正常登录 A、撤销旧 token；旧端 Pull 返回 `reauthentication_required`，紧接着旧端 `list_sync_conflicts` 仍返回来源：`denied=false / conflictCount=1 / sourceDisclosed=true`。保留失败断言和 exit1，不因前一有界 PASS 覆盖 FAIL。401 路径只返回错误、未失效 `local_session`；冲突 authorizer 仍接受该会话。这是已知在线认证失效后未强制锁定，不是正常 24h 离线登录，也不是已证明 B 绕过 A 的 owner。
- **UI 验收 BLOCKED**：App 仅由 mock fixture 挂载冲突面板，生产 `tauriSyncApi` 无调用者。已检查真实 B Home 截图/控制台，无 fixture 来源标记，但此前没有真实冲突敏感 UI 可见，不能当作“切换后缓存已清除”。缺少实际冲突视图的认证挂载/卸载及迟到响应证据；不在本轮擅自开发完整 G4 订单解决。

结论：**G1 = OPEN，独立验收 FAIL，不允许 CLOSED。** 最小下一任务是 G1-QA-001：在可信 Rust 边界使匹配的被拒绝账号/会话原子失效、清理对应 UI 敏感状态并保留业务/outbox/conflict；迟到 A 的401不得锁定新 B。它关联既有 G5 会话撤销根因，同时阻塞本轮 G1 明确的认证失效门，不归为 G2 正式投影或 G3 业务拒绝重试。修复后重跑保留 RED 场景，再补真实冲突 UI 生命周期证据。原生 NULL-owner 仍仅 unit/migration 证据，不伪造恢复归属；未运行真实 idle 等待。详见 QA_REPORT 最新 G1 段及 BUG_QUEUE。

所有原生原件保留于本 QA 工作树 `.honsen-native-qa/`、`test-results/`；不提交 SQLite/WebView/凭据文件。未改生产/迁移/协议、未推送/合并 main、未清理旧证据。**NATIVE-008 CLOSED；T10、T10-SEC-001、P1、Formal hold OPEN。**

## G1 实施覆盖记录 — 2026-10-18

以下审计原文继承自文档提交 `50378dd`，其 Q 基线矩阵和 15/22/6/2 历史计数保持原义，不自动改成实施后的独立验收结果。

本轮 `codex/g1-conflict-origin` 在 `E:/Project/honsen-g1-integration` 从 `be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95` 开始，最小适配 `031ad67`：补 owner 过滤的列表和按 ID 处理、拒绝伪造身份字段、同一 SQLite 锁内校验角色/当前账号与归属，复用安全拒绝 UI/测试。原 source 没有列表过滤，不能只 cherry-pick 就接受读取隔离；辅助只读审查发现的角色借用竞态也已修正。无新迁移/同步协议/server 生产/G2/G3/订单完整解决改动。

Builder 证据：原基线三条预期失败回归；最终 Rust 59/59、真实 PostgreSQL G1 3/3、API/service 19/19、定向 store 5/5（34 条明确筛选未执行）、fixture DOM 2/2、desktop unit 11/11、lint/typecheck/build/fmt/diff 通过。实现 SHA 为包含本覆盖记录及已测代码的本地提交，由交付消息给出。完整命令、原生限制和环境失败记录见 `docs/agent-coordination/QA_REPORT.md` 的 G1 段。

**G1 = READY_FOR_RECHECK，不是 CLOSED。** 独立 Fixer 和真实 EXE 同 profile A/B/legacy/已知 conflict ID 场景未执行；现有 `ab-sync-security` 不能替代该缺口，尚无专用 G1 原生 mode。没有凭单元/HTTP/模拟 IPC DOM 宣称跨账号原生验收完成。下一步是独立复核 G1，不开始 G2/G3。T10、T10-SEC-001、P1、Formal hold 保持 OPEN；NATIVE-008 保持 CLOSED。下面历史审计原文保留，未合并 main、推送或清理既有证据。

审计日期：2026-10-18。角色：独立 Integration Auditor。范围：既有任务、实现和证据的只读核对；交付审计文档，不实施修复。

**结论：T10 不可 CLOSED；T10-SEC-001、原始 P1 和 Formal hold 均保持 OPEN。NATIVE-008 保持 CLOSED。** 已接受的原生可靠性证据不能替代采购业务、订单冲突解决、审批和正式签发的跨端验收。

## 1. 审计基线、分支及证据归属

### 1.1 三个不同基线

| 标识 | 完整 SHA                                   | 含义及本轮核对结果                                                                                                             |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| H    | `74365f0f39032d4b768d8bc4c397b626221820f1` | 调用目录 `E:/Project/Honsen materials` 的初始 Git HEAD；初始分支 `codex/t04-unit-management`。这是当前工作目录代码的审计基线。 |
| M    | `5139cc8f7d5a70cddb80b3ce5665100a316c9656` | 本轮成功 `git fetch origin main` 后的 `origin/main`，也是本地 main。H 含 M，额外有 23 个提交。                                 |
| Q    | `be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95` | 用户指定的独立 QA 文档检查点；本报告完整验收矩阵评估的**集成候选**，不是 H。Q 含 H，比 H 多 70 个提交；尚未进入 main。         |
| N8   | `03f432ab102b42d2b41e5b2a546b57c5e74f7762` | NATIVE-008 最终独立 QA 实际被测 HEAD。N8→Q 只修改 QA_REPORT、BUG_QUEUE、memory 三份文档，应用实现无差异。                      |

H 与 M 都不存在 `docs/agent-coordination/QA_REPORT.md`、`BUG_QUEUE.md`。本轮从 **Q 的不可变 Git 对象**读取这两份文件，而没有把它们当成 H 的本地文档或测试结果。§4 的 PASS 全部限定于该行注明的被测 SHA/范围；**不授予 H 或 main 同等验收状态**。

开始时 H 没有已跟踪文件的暂存或未暂存差异；仅有原有未跟踪 `.honsen-e2e/`、`apps/desktop/src-tauri/.honsen-native-e2e/`。两处保留。为保存文档检查点，从 H 建立 `codex/t10-closure-gap-audit`，未切换生产文件内容；H 已包含本轮 fetch 的最新 main。本轮没有修改应用、测试、迁移或 Toolbox 契约。

### 1.2 当前 HEAD、其他工作树与 main 的差异

| 能力/工作树                                                                                                            | 实际位置或检查点                                                                                       | H / main / Q 的关系                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主数据离线维护、业务表投影、unit/default REST→Pull、Push cursor 提交顺序修复                                           | H；`cb22e0e`、`74365f0` 等                                                                             | H 已有，Q 继承；main 未包含 H 的这 23 个提交。                                                                                                        |
| 原有采购草稿、审批/修订、部分收货、HTTPS 同步、通用冲突命令/fixture                                                    | H 与 M 的相关路径                                                                                      | 已有局部实现，不等于真实 EXE 协作闭环通过。H 的 outbox 无账号归属、Pull 是全局状态，server 仍使用请求 `deviceId`。                                    |
| Owner OPA 本地签发、RFQ lifecycle/Pull、payment 本地记录、账号 owner/cursor、server origin/正式 registry、原生 harness | Q 中合并后的实现；server 集成基线 `b203c70`                                                            | 不在 H/main；Q 包含这些实现和后续原生验证。不能在 H 宣称已装配。                                                                                      |
| Windows Credential Manager 后端                                                                                        | Q 的 `28441d1fc9f34c3187a472f005e7134f6f829f40`                                                        | Q 启用 `keyring/windows-native`；H/main 仍为默认 `keyring = "3.6.3"`，不能继承 Q 的跨进程凭据证据。                                                   |
| 冲突解决来源保护                                                                                                       | `codex/t10-runtime-sync`，`031ad670b90903c280f7b01567e7d6753bd8a3c9`                                   | 源工作树干净；H、M、Q 都不包含该提交。读取实际 resolver 确认 Q 仍缺 owner 校验，非仅提交祖先不同。                                                    |
| Server origin 源分支                                                                                                   | `codex/p1-sync-event-origin`，`514747dfd4239aefd092e59341c3539e40c40b6a`                               | 源工作树干净；Q 包含，H/main 未包含；独立 server QA 属于组合 `b203c70`。                                                                              |
| 未解决的 desktop 集成工作树                                                                                            | `.../t08-t10-desktop-integration/Honsen materials`，`0a42ebead9797250261297c35a9378507cc8c7f6`         | 仍有 `lib.rs`、BUILD-TASKS、ROADMAP、memory 四处 UU；不作为可验收实现。                                                                               |
| 另一 resolve 工作树                                                                                                    | `.../t08-t10-desktop-integration-resolve/Honsen materials`，`077148ba6ea309aa046f7c6a58a1340a1a7b6359` | 工作树干净，提交不在 Q；不借它的结果补 Q 的门。                                                                                                       |
| QA server 工作树                                                                                                       | `.../qa-b203c70/Honsen materials`，`ed9505953f803f8abc859ab402bbc30f896d8035`                          | 仅有原有未跟踪 `.honsen-native-qa/`；保留早期 NATIVE-002～007 原件。                                                                                  |
| 最终 NATIVE-008 QA 工作树                                                                                              | `.../native008-recheck/Honsen materials`，`3c76f43245bc88511e4ea45e0e29964ec74ccd01`                   | Q 之后只有另一份审计草稿；原生原件仍在 `.honsen-native-qa/`。其 `docs/agent-coordination/T10-CLOSURE-GAP-AUDIT.md` 是已有二手审计线索，不是新增测试。 |

源 Formal/RFQ 分支存在重放或合并形成的等价实现，不能仅凭源 SHA 不在祖先链就宣布功能完全未集成。本报告对 Q 是否含功能的判断来自对应文件。所有上述未合入 main 的实现，本轮均未推送、合并或发布。

## 2. 原始任务、约束及关闭条件

本轮先读 AGENTS、H 的 memory，再读 Q 的 QA_REPORT/BUG_QUEUE、原始安全记录、BUILD-TASKS、ROADMAP、PRD、SPECS、ARCHITECTURE、SYNC-PROTOCOL、SECURITY、TEST-RULES 和相关 DECISIONS。之后只追踪证据缺口涉及的代码。

T10 原始定义：`docs/BUILD-TASKS.md` 的任务表；依赖 **T04～T09**。交付包括 server change log、SQLite 事务 outbox、HTTPS Push/Pull、幂等、cursor 恢复、WebSocket hints、冲突记录与管理员明确选择，包含已签发编号和报价冻结快照的不可变性。原始必需 DOM：离线正式签发，模拟目录撤销/变化并重连，编号/快照不变，重复编号或不同快照成为可审计冲突。

原始子项如下，不能用历史局部通过替代：

| 子项  | 原始验收边界                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| T10-A | 完整业务 Pull 投影、依赖暂存、正式编号/价格/来源/汇率/markup/final 快照保留；child、RFQ、receipt、attachment 各自业务读模型可用。 |
| T10-B | 登录启动、有限退避/重连、真实待同步/冲突/上次成功状态、持久 cursor、server ACK 后才确认；失败与重试证据。                         |
| T10-C | 桌面 WebSocket hint→普通 Pull；撤销 session、旧 token、漏 hint/重连和锁定；server endpoint 测试不能单独接受桌面调度。             |
| T10-D | 正常生产路由的管理员冲突选择/原因/version/outbox 审计，保留不可变记录限制。                                                       |
| T10-E | 多设备断网/重连/幂等/冲突 DOM、API 和真实客户端证据；正式编号碰撞、不同冻结快照，无必需集成测试跳过。                             |
| T10-F | T04～T09 原始前置验收和所有原始质量门完成。                                                                                       |

代码任务全局门仍包括 format、lint、strict typecheck、unit、build、可复现 Playwright DOM、相关 Rust/API/集成及迁移/失败/重试/冲突检查。本轮文档审计不重新执行这些生产验收门。

### 2.1 原始 P1 / T10-SEC-001

原始证据：`a40c6fa453b37c9051d57db7c8759a782819ab51:docs/qa/2026-10-15-t10-multi-account-outbox-598ef12.md`；被审代码 `598ef12dd3e7d67d4416fff942f12634787c4103`。根因是 A 的离线 outbox 未保存 owner，B 登录后使用 B token 发送/接受/审计 A 的事件。记录明确要求 A→B SQLite/HTTP 回归，并覆盖冲突列举、ACK、解决归属；不是 UI 隐藏按钮问题。

后续 `Q:docs/BUILD-TASKS.md` 的 SEC 检查点增加：账号独立 Pull cursor/last-success、异步迟到响应拒绝、在线认证守卫、server origin、旧 owner/cursor 的无损迁移与有审计恢复、共享 SQLite 可见性、真实 A-offline/B-online/native 回归。§6 按这些原始及后续明确条件核对。**P1 在此处首先指原始安全问题，不是“所有 P1 优先级工作”的统称。**

### 2.2 原始 Formal hold 与产品边界

原始 hold：`c8204b80ae0e83211fea1aa2cddd5a28ecf564cc:memory.md`，集成 `b761dc4` 被退回：没有已批准前件即可签发、工程师可 Push 审批/签发、已登记文档可改冻结内容/非法跳状态。后续 server hardening 和 `b203c70` 独立 QA 对这些局部问题已有直接证据；不能继续声称三项在 Q 完全没有保护，也不能据此解除整个 Formal hold。

`Q:docs/agent-coordination/BUG_QUEUE.md` 的 **HOLD-001** 和 DEV_HANDOFF 明确保留 P1/Formal，要求真实 Tauri A/B、Push/Pull/冲突/重放、旧 token、重连和 Formal/RFQ 流程。没有找到另一个带唯一编号、完整字段的独立“Formal hold 关闭清单”；这是记录缺口，不能自行补写批准。

PRD §采购模式、SPECS 业务规则、DECISIONS 和 SYNC-PROTOCOL 已批准：**本地离线分配编号并冻结，服务端随后权威登记/校验，永不重编号**。本报告 D5/D9 对“服务端确认”的判断指服务器接受与登记，不能解释为取消离线正式签发。离线本地已签发与云端已登记/已同步必须分别可辨；不要求把合法本地签发伪装成草稿。审批、正式签发、冻结快照仍是 v1.0 范围。

## 3. 已有证据清单及可信边界

以下均为已有运行；本轮未重新运行。E 编号包含文件、被测 SHA 和 run 信息，供每个矩阵 PASS 精确引用。

| 证据 | 被测 SHA / QA 检查点 / run                                                                                                                                                     | 对应证明与限制                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E0   | `b203c70fd83a5dbcdb01fcaf9184d5b9fa9bbd13`；QA 文档 `26c187bb5d94c234323451286ed42e5f94112643`；2026-10-16 `qa-b203c70-server-full-fresh` / `qa-b203c70-server-combination-57` | 独立 PostgreSQL full server **92/92**、组合 **57/57**；`formal-issue*.test.ts`、`sync/postgres-store.test.ts`、`service.test.ts`、migration/auth。本轮读到原日志尾的对应计数。是 server 证据，无真实 EXE Formal 业务结果。                                                                                                 |
| E1   | `87ab8e5bf18511cfa84ce97ef925502a7210e75f`；run `native-smoke-20261017153900`                                                                                                  | NATIVE-002 独立真实 EXE：不同 installation、伪造 deviceId 不改变可信 origin、post-commit 503 后幂等 replay、无授权 B Pull 隔离、B stale Push/Pull 后一条本地冲突。B 从构造的同 UUID stale draft 开始；不是双端同版本离线编辑，更没有解决冲突。                                                                             |
| E2   | `bc80b09e303d09e338a629736dbbc783cbc940f0`；run `native-smoke-20261017155533`；回归 `...155623`                                                                                | NATIVE-003 独立 EXE，首 Pull 503，cursor 不变，同 profile 新进程 Pull 一条、再 replay 零条。                                                                                                                                                                                                                               |
| E3   | `b16f3061ce28d43b2b82ff8cbdd4f6d59c1ae91e`；run `native-smoke-20261017161819`                                                                                                  | NATIVE-004 独立 EXE；实际停 HTTPS 后调用生产 `save_requisition_draft`，draft/outbox 落库、失败 Push、重启保留同 event，恢复 Push 一次/Pull 一条。**是新建草稿，不是修改已有云端订单**。                                                                                                                                    |
| E4   | `ae1bfc9c336ad91e068bf4e15895314eeeb5a901`；run `native-smoke-20261017162947`                                                                                                  | NATIVE-005 独立 EXE；一个实际 POST 返回 accepted@1/conflict@1，选择性 ACK，pending/conflict=1，Pull 2，最后只 replay conflict。没有证明 validation_error 的持久处置。                                                                                                                                                      |
| E5   | `1a5d71960507c5adc48b4bddd1bf84e016b07b77`；run `native-smoke-20261018112034`                                                                                                  | NATIVE-006 独立 EXE；生产 draft/Push 501 条；第一页 500 提交，第二页 503，重启从 500 再取 1、cursor 501，replay 0。                                                                                                                                                                                                        |
| E6   | `c90480fb1ec0507e2b084d1fd806a5fae423fc72`；run `native-smoke-20261018114610`；回归 `...114720`                                                                                | NATIVE-007 独立 EXE；实际 Pull 在 cursor upsert 前注入 NOT NULL 写失败，整个投影/cursor 回滚为 0/0；新进程恢复 1/1，replay 0。                                                                                                                                                                                             |
| E7   | N8 被测实现；Q 独立 QA 记录；A `native-smoke-20261018151230`、B `native-smoke-20261018151430`                                                                                  | NATIVE-008 **CLOSED**：真实 EXE 在 preHandler/提交前和 onSend/提交后 ACK 前强杀；socket-close 必须在 held barrier/response incomplete 时被观察。A PG eventCount/eventVersion/entityVersion 为 0/0/0→1/1/1，B 1/1/1 不变；同 profile/installation/event，outbox 1→0、Pull 1、replay 0。不是所有业务流程或所有强杀点的验收。 |
| E8   | N8 的独立 `cargo test --lib` **55/55**；`Q:apps/desktop/src-tauri/src/lib.rs` 内命名测试                                                                                       | 包括 `owner_pricing_requires_a_catalog_or_audited_manual_quote_and_freezes_the_result`、`pull_page_advances_cursor_atomically_and_preserves_local_conflicts`、账号 cursor/owner/migration/online guard、RFQ Pull 等。它们是局部 Rust/SQLite 不变量证据；含直接 SQL fixture，不能充当真实原生业务闭环。                     |
| E9   | `Q:apps/desktop/src/lib/sync-lifecycle.test.ts`、`tests/e2e/sync-lifecycle.spec.ts`、`tests/e2e/navigation.spec.ts`；历史 Builder 记录                                         | 有登录调度、重连/退避、锁定、状态和正常订单 UI 的 DOM 测试。未找到覆盖完整协作闭环的新独立 run/SHA 绑定；conflict 测试访问 `?test=sync-conflict`，resolve adapter 为空函数。不能据其标记真实解决通过。                                                                                                                     |
| E10  | 源修复 `031ad670b90903c280f7b01567e7d6753bd8a3c9`；其 memory 记录 Rust 42/42、DOM 36/36                                                                                        | 新测试 `conflict_resolution_never_changes_another_accounts_or_legacy_event_owner`；源分支开发证据，部分 server PostgreSQL suites 跳过；不在 Q，不计 Q 的 PASS。                                                                                                                                                            |
| E11  | 本轮只读文档核对 `T10-audit-20261018`，H/Q 的 PRD、SPECS、ARCHITECTURE、SYNC-PROTOCOL、BUILD-TASKS                                                                             | 仅证明已定义的职责/验收边界；无应用测试 run，不证明实现通过。                                                                                                                                                                                                                                                              |

E1～E6 的原始 JSON 位于 `C:/Users/This PC/.codex/worktrees/qa-b203c70/Honsen materials/.honsen-native-qa/`；E7 位于 `.../native008-recheck/Honsen materials/.honsen-native-qa/`。本轮只读解析 E1/E3～E7 的指定 JSON、核对 E2 文件存在，读取 E0 的两份日志尾；E7 的 JSONL/取消证据沿用最终独立 QA 记录，未重复打印日志或打开 SQLite 数据库。全部原件保留。

E0→Q 的 sync service/store、formal 模块、shared 与 server migrations 没有变化；`app.ts` 增加注入 Fastify 实例参数用于 HTTPS 测试，另有 test-host 脚本变化。这支持复用 E0 的局部领域证据，不能称 Q 全 server suite 本轮重跑。E1～E6 之后 Rust 有变更，后续 55/55 和对应场景 QA 提供局部回归；本报告仍保留原测试 SHA，不编造 Q 全流程 run。

## 4. 完整验收矩阵

**对象为集成候选 Q；不是当前目录 H/main 的验收表。** Rust=`apps/desktop/src-tauri/src/lib.rs`，Native=`apps/desktop/src-tauri/src/main.rs`，Server=`apps/server/src/sync/`。实现位置为 Q 的 Git 内容；测试 SHA 栏中的 E 编号须按 §3 的完整 SHA/run 读取。PASS 只覆盖行内明确限定的条件。PARTIAL=实现或证据不完整；MISSING=没有对应实现或有效结果；BLOCKED=明确依赖/安全阻止验收。

| ID  | 原始验收条件                       | 实现位置                                                              | 测试证据                                                | 测试 SHA                                   | 状态    | 缺口                                                                                                                         |
| --- | ---------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A1  | 断网后通过真实业务命令创建采购单   | Rust `save_requisition_draft`/`save_requisition`；Native offline mode | E3：停真实 HTTPS 后创建采购草稿                         | `b16f306` / E3 run                         | PASS    | 通过范围是新建草稿，不含批准或正式签发。                                                                                     |
| A2  | 离线修改已有采购单                 | Rust draft/revision 命令                                              | E8/E9 局部；E3 只新建                                   | N8；E9 未完整绑定                          | PARTIAL | 无已同步云端版本→离线修改原订单→重启→同步的真实 EXE 证据。                                                                   |
| A3  | 正确持久化至 SQLite                | Rust `save_requisition` 事务                                          | E3 本地 draft 与恢复结果                                | `b16f306` / E3 run                         | PASS    | 仅该采购草稿范围。                                                                                                           |
| A4  | 业务命令自动产生 Outbox            | Rust `insert_local_sync_outbox`，与保存同事务                         | E3 实际 draft save 后 pending=1                         | `b16f306` / E3 run                         | PASS    | 新业务类型必须各自证明，不外推。                                                                                             |
| A5  | 关闭 EXE 重启数据仍存在            | Native offline/recovered 两进程                                       | E3 同 profile/订单/event/install 保留                   | `b16f306` / E3 run                         | PASS    | 不代表备份克隆或全部文件恢复。                                                                                               |
| A6  | 恢复网络可自动或手动 Push/Pull     | Rust Push/Pull；`src/lib/sync-lifecycle.ts`                           | E3 真实命令恢复；E9 DOM 调度                            | `b16f306`；E9                              | PARTIAL | 命令恢复已有 PASS；正常窗口离线启动、登录、真实自动调度到业务结果仍缺证据。                                                  |
| A7  | 识别是否只靠测试注入事件           | Native offline mode→生产 save；E3                                     | 源路径及 E3 原件交叉核对，无直接 SQL 写 outbox          | `b16f306` / E3 run                         | PASS    | 草稿可靠性测试确用真实业务命令；不能把它扩展成全业务或 UI 证明。                                                             |
| B1  | 两 installation 离线修改同一订单   | Native ab-sync-security；Rust optimistic versions                     | E1 用同 UUID 构造 stale draft                           | `87ab8e5` / E1 run                         | PARTIAL | 无双方先 Pull 同一版本，再断网编辑不同字段的场景。                                                                           |
| B2  | 两端各自修改都被保留               | Rust Pull dirty guard/conflict payload；Server conflict               | E1/E4 保留 stale pending 和 remote                      | `87ab8e5` / `ae1bfc9`                      | PARTIAL | 有界保留已有证据；缺两个真实离线编辑结果和解决后历史证明。                                                                   |
| B3  | 重连服务端检测版本冲突             | Server `pushEvent`；Rust Pull                                         | E1/E4 实际 conflict@1、pending 保留                     | `87ab8e5` / E1 run；`ae1bfc9` / E4 run     | PASS    | 这是冲突检测，不是冲突解决。                                                                                                 |
| B4  | 无静默覆盖                         | Rust dirty guard；Server version CAS                                  | E0/E1/E4/E6 局部保护                                    | `b203c70`、各原生 SHA                      | PARTIAL | pending 保护通过；完整业务无损仍被 Formal Pull 缺字段及未完成 resolver 阻塞。                                                |
| B5  | 冲突在客户端显示                   | `SyncConflictPanel.tsx`、App fixture；shell count                     | E9 fixture DOM；E1 读本地冲突                           | E9；`87ab8e5`                              | PARTIAL | 正常生产路由未挂载比较/选择面板；只显示计数不是可处理业务入口。                                                              |
| B6  | 用户明确选择或合并订单修改         | Rust `is_directly_resolvable_sync_entity` 排除 purchase_order         | 无订单冲突解决闭环证据                                  | 无                                         | MISSING | catalog/reference 可选，订单没有完整替代修订/解决入口；不授权原地改正式件。                                                  |
| B7  | 订单解决产生合法新事件             | Rust 通用 resolver 有新 event，但不处理订单                           | 无真实订单解决 event                                    | 无                                         | MISSING | 必须有正确 owner、baseVersion、原因、supersession 和业务结果。                                                               |
| B8  | 解决后服务端形成新权威版本         | Server 可接通用 versioned events                                      | 无 B6→B7→新版本结果                                     | 无                                         | MISSING | 泛型单测不能代替订单 resolver 业务验收。                                                                                     |
| B9  | 双端再 Pull 最终一致               | purchase_order projector / resolver                                   | 原生测试到检测/投影即止                                 | 无有效完整 run                             | MISSING | 缺比较双方实际订单读模型、快照、version 与残留 pending/conflict 的结果。                                                     |
| B10 | 冲突历史可审计                     | local_sync_conflicts；server sync_conflicts；resolved 字段            | E0/E8 留存；E9 只显示待处理项                           | `b203c70`；N8                              | PARTIAL | 缺正常可追溯读取完整已解决历史及订单解决后原双方修改保留证据。                                                               |
| C1  | Push 幂等性                        | Server event-id；Rust selective ACK                                   | E1 post-commit 503/replay；E7 count/version             | `87ab8e5` / E1；N8 / E7                    | PASS    | 仅已覆盖的事件与故障边界，不重跑。                                                                                           |
| C2  | 部分成功批次                       | Rust ACK；Server per-event results                                    | E4 accepted/conflict 同 POST，最后只发 conflict         | `ae1bfc9` / E4 run                         | PASS    | 不包含完整 validation_error 用户处置。                                                                                       |
| C3  | Pull cursor 原子性                 | Rust `apply_sync_pull_page_for_account`                               | E6 cursor 写失败，projection/cursor 整页回滚            | `c90480f` / E6 run                         | PASS    | 已有事务内失败/重启证据。                                                                                                    |
| C4  | 分页 Pull 恢复                     | Rust full-page loop                                                   | E5 500→失败→新 EXE 501，replay 0                        | `1a5d719` / E5 run                         | PASS    | 该故障边界已接受。                                                                                                           |
| C5  | EXE 强杀恢复                       | Native termination mode；test-host barrier                            | E7 提交前/提交后 ACK 前两种真实强杀                     | N8；QA Q / E7 两 run                       | PASS    | NATIVE-008 保持 CLOSED；不外推所有命令或事务强杀点。                                                                         |
| C6  | installation 身份隔离              | Rust profile；session origin                                          | E1 distinct installations、trusted origins              | `87ab8e5` / E1 run                         | PASS    | 不等于同一安装内换账号后的冲突 requeue 归属隔离。                                                                            |
| C7  | 账号身份与权限校验                 | trusted online guard/owner/cursor；Server auth/canWrite               | E0/E1/E8 局部通过                                       | `b203c70`、`87ab8e5`、N8                   | PARTIAL | resolver 仍可跨账号改事件归属；共享 profile 原生矩阵、legacy recovery 未完成。                                               |
| C8  | 伪造 deviceId 防护                 | Server `SyncService.push` 用 `actor.installationId`                   | E0 origin tests；E1 实际伪造与可信 origin 不同          | `b203c70`；`87ab8e5` / E1 run              | PASS    | 来自账号会话，不要求另设设备凭据；H 尚未集成。                                                                               |
| C9  | 服务端版本控制                     | Server `PostgresSyncStore.pushEvent` CAS/event log                    | E0 version/conflict/replay；E1/E7 实际版本              | `b203c70`、`87ab8e5`、N8                   | PASS    | 证明 version/幂等保护，不证明任意业务 payload 已获完整校验。                                                                 |
| C10 | 冲突与权限拒绝区分                 | server result enum；Rust ACK/HTTP；lifecycle                          | E4 conflict；E0 validation_error 拒绝                   | `ae1bfc9`、`b203c70`                       | PARTIAL | Rust 丢弃非 accepted 结果细节；除 401 外 HTTP 失败归 SyncTransport，周期继续重发冲突/验证拒绝。缺持久分类和可操作原因。      |
| C11 | 无绕过服务端权威路径               | Server origin/formal guards；Rust resolver                            | E0 防原始 Formal 绕过；Q resolver 静态反证              | `b203c70`；Q                               | PARTIAL | server origin 无法识别被本地 resolver 重新包装成 B-owned 的 A payload；仍缺 owner gate 和 Formal 本地冲突 gate。             |
| C12 | T10-SEC-001 原始条件全满足         | 见 §6                                                                 | E0～E8 局部；E10 在树外                                 | Q；未有完整关闭 run                        | BLOCKED | 明确安全缺陷、legacy 恢复规则/证据和原生 shared-profile 矩阵未清。                                                           |
| D1  | 离线审批有明确本地/待确认状态      | Rust confirm/audit/outbox；history；shell sync state                  | E8 局部，E9 DOM                                         | N8；E9                                     | PARTIAL | 无订单级本地审批与 server 已接受的完整可辨证据；普通“已批准”加全局 pending 不足以接受完整语义。                              |
| D2  | server 独立校验审批权限            | `service.ts`、`validOrderApproval`、`hasApprovalProvenance`           | E0 formal-hardening：distinct approver、engineer denial | `b203c70` / E0 runs                        | PARTIAL | 普通禁止自批路径有直接证据；已批准的 super-admin 自批 override 只有 SQLite policy，server fail-closed，v1.0 完整策略未接通。 |
| D3  | 审批历史可追溯                     | local audit、server change-log approver provenance                    | E0/E8                                                   | `b203c70`；N8                              | PARTIAL | 缺真实跨端审批历史/修订周期审计读模型和完整 native 流程。                                                                    |
| D4  | unresolved 冲突阻止不安全签发      | Rust `issue_owner_formal_order`                                       | 未查询 unresolved order conflicts；无相应负例           | Q 静态检查                                 | MISSING | role/scope/status/rate 检查不能替代冲突 gate；server 拒绝保护不等于本地已阻止。                                              |
| D5  | 正式登记由 server 权威确认         | Server `registerFormalIssue`；registry migration 006                  | E0 必须 exact approved 前件、注册/碰撞/回滚             | `b203c70` / E0 runs                        | PARTIAL | OPA server 局部通过；无真实 EXE 批准→离线 issue→登记及拒绝可恢复全链。合法离线发号本身获准。                                 |
| D6  | 签发生成不可变冻结快照             | Rust issue；SQLite 0044 triggers；server registry                     | E8 本地；E0 server；无完整 native formal                | N8；`b203c70`                              | PARTIAL | OPA 局部实现；HPA/SPO 正式命令/登记未完成，Pull DTO 丢正式/owner 字段。                                                      |
| D7  | 快照含报价、金额、汇率、附件引用   | `order_sync_payload`/owner line；`formal-issue.ts`                    | E0 exact arithmetic；E8 source/rate freeze              | `b203c70`；N8                              | PARTIAL | 已有金额/原价/汇率 decimal/markup，但缺汇率记录 source/effective 追溯字段、完整附件冻结引用与跨端验证。                      |
| D8  | 后续同步不能覆盖冻结快照           | SQLite triggers；server registry；Pull projector                      | E0 server 冻结字段/非法状态拒绝；E8 本地                | `b203c70`；N8                              | PARTIAL | Q Pull 不投影完整正式/owner 数据；已 approved 行直接返回，不能到完整 issued 读模型。未证明跨端冻结一致。                     |
| D9  | 离线不伪造云端正式登记成功         | local issue 与 server ACK 分离                                        | E3 ACK 规则仅草稿；E8 本地 issue；E0 server             | `b16f306`、N8、`b203c70`                   | PARTIAL | 缺真实 UI 对本地签发待登记、server 拒绝/冲突与已登记的区分和禁止冒充结果证据；离线合法签发不等于伪造。                       |
| D10 | T08/Formal 与 T10 职责清楚         | BUILD-TASKS OPA-3/6；PRD；SYNC-PROTOCOL                               | E11 文档核对，本地发号、server 注册不重编               | H/Q；审计 `T10-audit-20261018`，无测试 run | PASS    | 文档职责明确；各 parent 和 Formal hold 仍需自身验收，不能降为 v1.1。                                                         |
| R-A | T10-A 完整投影与正式快照保留       | Rust staged purchase/RFQ；缺余下 projector/contract                   | E0/E8 局部                                              | `b203c70`；N8                              | PARTIAL | Formal read model、receipt/attachment/payment 全链欠缺。                                                                     |
| R-B | T10-B 完整启动/重试/状态/恢复      | App/lifecycle/status；Rust HTTPS                                      | E1～E9 局部                                             | 各原 SHA                                   | PARTIAL | 原生正常调度及结构化不可重试错误未接受。                                                                                     |
| R-C | T10-C 桌面 hint 与 live revocation | Server `app.ts`；desktop 无 WS client                                 | server endpoint 证据不能替代 desktop                    | `b203c70`；Q                               | MISSING | 无桌面接入；server socket 只订阅时认证，撤销断连与桌面锁定未闭环。                                                           |
| R-D | T10-D 生产管理员冲突解决           | resolver + fixture                                                    | E8/E9；E10 未集成                                       | N8；来源 `031ad67`                         | PARTIAL | 缺安全 owner guard、生产入口/比较、订单修订解决到权威新版本。                                                                |
| R-E | T10-E 完整多设备/正式冲突验收      | Native bounded harness                                                | E1～E7 已接受，无 formal workflow mode                  | 各原生 SHA                                 | PARTIAL | 原生可靠性已有；完整业务协作/签发碰撞/最终一致缺失。                                                                         |
| R-F | T10-F 前置与全局门完整             | BUILD-TASKS/ROADMAP                                                   | T04/T08/T09 仍 unchecked                                | H/Q，E11                                   | BLOCKED | T04 部署授权/实际记录、T08/Formal、T09/文件归档及原质量门未关闭。                                                            |

主矩阵 **45 项：PASS 15、PARTIAL 22、MISSING 6、BLOCKED 2**。其中 A～D 用户问题 39 项为 15/18/5/1；R-A～F 六项为 0/4/1/1。原始 T10 子项完整通过数为 **0/6**。下文重复引用这些条件时不重复计数。

对于当前目录 H：矩阵内源自 E0～E10 的 PASS **均不得继承**。H 没有 Q 的 owner/cursor、server origin、Formal registry/issue、native backend 修复与 harness；其现有局部测试只支持 H memory 中记载的原范围。本轮没有为 H 新执行原生验收，因此不能给 H 编造一套“同样 15 项 PASS”的数字。上述差异本身已足以阻止 H/main 投入多人正式使用。

## 5. 缺口核实：只追踪了缺证据的边界

### F1 / P0：冲突解决可重新归属另一账号的 payload

Q Rust `resolve_sync_conflict`（约 5269 行）按 conflict ID 查询，没有 join outbox owner；`keep_local` 插入新 event 时把 owner 设置为当前 actor。因而即使 Push 本身只选择 B-owned，B 管理员仍能把 A-owned 或 NULL-owner 的直接可解决冲突包装为 B-owned。`use_server` 同样无 owner gate。server 只知道这个新 event 的 B session，不能还原被本地重包装的来源。

这是定向静态可达路径，不声称本轮重新运行了 exploit。既有 `031ad67` 已有最小 guard 和失败回归，但不在 Q；Q 的 list 也全局列出 unresolved。管理员能否跨账号看冲突、能否代办是待明示的授权边界；**不能默许代办时抹掉原 owner**。原始 P1 仍有实质 blocker。

### F2 / P0：正式快照在第二端业务投影缺失

Q `RemotePurchaseOrderPayload`（约 681 行）、line DTO 不含 formal 编号/installation/sequence/snapshot 和 owner source/rate/markup/final 字段。`project_remote_purchase_order_change`（约 7384 行）INSERT/UPDATE 也未写入它们。Serde 默认忽略额外字段；validator 允许 `formally_issued` 状态。新客户端可能得到 issued 状态却没有正式编号/冻结明细；已有 approved/confirmed 行则提前返回，仅有窄化 mode 补写，不会投影后续正式状态/编号。

远端原始 payload 仍在 staging，因此这里不是“服务器原件已删除”的结论；它是**持久业务读模型缺字段和不能收敛**的明确实现缺口。正式件在另一端的读取、后续变更拦截和重印不可验收。修复必须同时覆盖新库、先有 approved 的库、staging 重放，不能只增 DTO。

### F3 / P1：检测、投影、解决和业务接受是四个阶段

E1/E4 证明冲突检测与本地记录。正常 App 只在 `?test=sync-conflict` 挂载面板；fixture resolver 是空实现，面板不显示两边字段内容。Rust 通用 resolver 排除 purchase_order，未找到完整订单修订解决路径。当前没有用户选择→合法新事件→server 新版本→双方实际订单一致的证据。保留 conflict 行与“冲突已解决”fixture 文案不能接受整个业务流程。

### F4 / P1：拒绝分类与自动调度尚欠完整处理

Q `apply_sync_acknowledgements_for_account` 只处理 accepted；conflict/validation_error 的结构化结果不持久化为可操作的对应原因。Push HTTPS 除 401 外的非成功 HTTP 统一映射 SyncTransport；lifecycle 每 60 秒再次 Push，冲突/验证拒绝仍占 pending 前列。已有有界 transport retry PASS 不覆盖错误分类、拒绝停止重试及邻居事件不饥饿。

Server WebSocket 只在订阅时 authenticate，保存 socket 后广播 minimal hint；无桌面 WS client 接入，亦未见 server 会话撤销关联断开。hint 不含业务正文，这里不推断采购数据泄露；缺的是原 T10-C 必需调度/撤销/锁定验收。

### F5 / P1：正式签发范围与审批权威仍未闭环

本地 `issue_owner_formal_order` 只有 OPA；`parseFormalIssue` 只接受 OPA。HPA/SPO 不能凭 namespace 文档视为已实现。本地 issue 检查角色/scope/status/定价和序号，但没有 unresolved conflict 查询。server exact approved snapshot、不同 approver、冻结注册保护已有 E0 证据，应保留；本地冲突 gate 缺失不等于 server 会接受伪造。

owner payload 保存 source price、currency、锁定 decimal、converted/markup/final，但没有完整 rate record ID/source/effective 快照及正式附件引用。已获批准的 super-admin 自批开关仅在 SQLite policy，server formal approval 对此 fail-closed；需接通权威审计策略，不得删掉原需求或绕过 fail-closed。克隆/re-key/并发编号及真实 formal workflow 的直接证据不足。

### F6 / P1：业务事件链并未随着可靠性测试自动完整

Q 已有 RFQ projector，child order 可走通用 order 依赖投影；旧 BUILD-TASKS 的“RFQ unprojected”文字落后于代码，不据此重写 RFQ。其完整 parent/source-item 关系及真实跨端恢复仍需证据。receipt/attachment 没有对应完整本地业务 projector。`record_procurement_expenditure` 会产生该 event，但 shared `syncEntityTypeSchema` 无此类型；server 请求验证会拒绝含该类型的批次。对支付的通用 accepted 计数不能证明业务表/只追加更正已实现。

这是原 T09/T10 已批准接口缺口；附件存储、压缩、归档由 T11 提供，打印由 T12 提供，不把它们冒称 T10 transport defect。元数据链接不替代文件归档。T04 实际授权初始化、T08/T09 父门仍是 T10-F 的原始依赖。

## 6. T10-SEC-001、P1 与 Formal hold 的独立状态

### 6.1 T10-SEC-001 原始及明确补充条件核对

此表是主矩阵 C7/C11/C12 的展开，不加入 45 项计数。

| 关闭条件                                                    | 当前证据                                       | 状态    | 真正剩余 blocker                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| A 事件 owner 与 ACK/Push 不随 B 登录改变                    | Q owner migration 0046、trusted session、E1/E8 | PARTIAL | 两 profile 原生证据不能接受同一安装内 A-offline→B-online 全链；resolver F1 仍可重包装。       |
| conflict list/resolve 的归属、保留和新 event 来源           | Q 静态反证；源修复 E10                         | BLOCKED | `031ad67` 未集成；须明确管理员可见/代办边界并拒绝无证据改 owner。                             |
| 每账号 cursor/success、迟到 A 响应不提交给 B                | SQLite 0047；E8 命名账号/rollback/restart 测试 | PARTIAL | 缺真实 shared-profile 账号切换和 in-flight late response 原生证据；不能用分页单账号恢复代替。 |
| server session origin、伪造 deviceId、跨 origin replay 拒绝 | E0、E1；migration 005                          | PASS    | 此局部已有直接证据；不因其他缺口重开。                                                        |
| legacy owner/cursor/origin 原件保留与有审计恢复             | 0046/47、005 quarantine；E0/E8 fail-closed     | BLOCKED | 没有获准的完整恢复政策/路径与验收；不得猜 owner 或直接清 pending。                            |
| 共享本地 projection 可见性、离线 token、撤销/旧会话         | scoped reads/online guard；E8/E9               | PARTIAL | 存在保护与局部测试；真实同安装多账号、禁用/旧 token/重连/锁定和历史保留仍未完整独立接受。     |
| 独立正式批准关闭                                            | 最终 Q 明确 SEC/P1/Formal OPEN                 | BLOCKED | 无正式关闭授权/验收结论；本审计无权替代。                                                     |

**T10-SEC-001：OPEN。** 直接 blocker 是 F1、legacy 恢复规则/实现/证据、真实 shared-profile 原生安全矩阵；T10-C 的撤销锁定按其原门另须接受。OPA 打印或所有 payment 功能缺失不应被改名成 SEC-001 的原始关闭条件。

**原始 P1：OPEN。** 初始“全局待发队列”在 Q 已有 owner containment，不应重复宣称完全没修；F1 仍能绕回错误归属，来源恢复和原生换账号闭环未接受。即使它修复，T10 与其他 v1.0 的 P1 优先级业务任务也不会自动 CLOSED。

**Formal hold：OPEN。** 原始 server 三类漏洞已有 E0 hardening 证据；仍欠 F2/F5 及真实 Tauri 正式业务/冲突和原 parent 验收。它关联 T08 本地 issue、T10 注册/投影/冲突、T09 receiving、T11 附件、T12 文档；不能简单等同于 NATIVE-008、SEC-001 或 transport 待办。

## 7. 按依赖排序的剩余任务

以下任务号为本审计建议，不是擅自改写 BUILD-TASKS 或接受新功能。只对应 PARTIAL/MISSING/BLOCKED。P0 是已找到的数据/来源完整性问题；P1 是 v1.0 必需闭环；P2 是非核心工程完善。实现期间仍需应用代码修改前的 Toolbox preflight、正常开发/独立 QA 门；本轮不执行。

### G1 — P0：集成现有冲突来源保护（推荐下一项）

- 缺口/影响模块：F1，Rust resolver、SyncConflictPanel 失败提示及其测试；影响 keep_local/use_server、owner、supersession 和审计。
- 前置依赖：Q 已有 0046 owner/0047 cursor；来源修复 `031ad67` 可读，依赖已满足。先在基于 Q 的独立任务树移植最小 guard/测试，不碰原 UU 工作树或照搬整条分支。
- 推荐角色/最小实现：Integration Owner；复用 `031ad67` 的 owner join/拒绝、失败保留行和回归，不新增迁移/设备凭据/管理员代办功能；列举可见性与代办权限未定义的部分记录下来，不能凭空放开。
- 最小验收：同 profile A-owned、NULL-owner conflicts；B 管理员 keep/use 均拒绝，outbox/conflict 不变；A-owner 管理员可合法解决，生成 event 保留 owner/base/reason。真实业务命令制造冲突作一次独立 shared-profile 原生复核；无需重跑 NATIVE-008。
- 完成标准：来源回归先失败后通过，相关 Rust/DOM/受影响包门及独立复核通过；失败提示可见，未授权不 supersede、不改版本。只关闭该缺口，不关闭任何 parent hold。
- 阻塞正式项：C7/C11/C12、T10-D、原始 P1；Formal 间接依赖。

### G2 — P0：修复正式订单的完整 Pull 业务投影

- 缺口/模块：F2，Rust remote DTO/validator/order projector/staging replay，必要的共享契约测试；不是重写 server registry。
- 前置依赖：Q 已有 formal schema 和 registry；可在与 G1 文件所有权协调后并行设计/测试，避免同时修改同一 lib.rs。
- 推荐角色/最小实现：Sync Owner；复用现有正式列，完整验证并投影 header/owner line frozen fields；处理先 approved→issued、空库、旧 staging 重放，保留正式件不可变规则。若确需新增列才加版本迁移。
- 最小验收：两个客户端起点分别为依赖齐全的空订单库、已有 approved；Pull issued 后编号、installation/sequence、全部 source/rate/markup/final/snapshot 逐字段一致；坏页回滚 cursor，目录/汇率变化不改冻结件。
- 完成标准：失败回归、旧 schema/staging 恢复、真实 EXE 接收方读模型与 server 原件一致；不能只看 staging JSON 或 synced 计数。
- 阻塞项：D6/D7/D8、R-A/R-E、Formal hold；不是原始 SEC-001 的同一根因。

### G3 — P1：结构化拒绝与可操作的非重试状态

- 缺口/模块：F4，shared result、Rust ACK/HTTP 分类、lifecycle/status/UI；可能需新增本地错误字段迁移。
- 前置依赖：现有协议与 owner guard；不需等待 Formal 业务完成。
- 推荐角色/最小实现：Runtime Owner；持久区分 conflict、validation/permission、transport、auth；显式拒绝不自动当网络重试，保留数据/原因/可恢复动作；正常事件不得被前 100 条永久拒绝饿死。
- 最小验收：同批 accepted/conflict/validation，配合 400/401/403/503；只 ACK accepted，transport 安全退避，auth 锁定/停重试，拒绝仍可查，修正/解决生成合法新事件。
- 完成标准：可信 Rust/API 失败回归、正常 DOM 和一条真实原生拒绝/恢复链；不把重发 conflict 的既有 E4 改写成旧测试失败。
- 阻塞项：C10、R-B/R-D、P1 优先级协作验收；非原始 P1 全部含义。

### G4 — P1：生产冲突解决及订单修订到双方一致

- 缺口/模块：F3，生产路由、比较/原因/历史 UI、可信 resolver/requisition revision、outbox/server version；复用现有 catalog/reference choices。
- 前置依赖：G1/G3；正式件还需 G2/G7。先接受可变 draft 和已定义的 catalog/reference 策略，不原地合并已冻结件。
- 推荐角色/最小实现：Workflow + Sync Owner；真实入口显示双方字段/version，管理员选择后生成合法 mutation，保留原冲突与审计；purchase_order 使用原需求的明确解决/修订流程，不仅删除 conflict 行。
- 最小验收：两 installation Pull 同一 v1，断网分别改原订单并重启，A Push v2，B 冲突；管理员选择/修订→新事件→server 新版本→双端业务读模型一致，双方原修改可追溯；另验 catalog use-server/tombstone。
- 完成标准：生产 DOM 非 fixture、可信命令/API 与独立真实 EXE 闭环均通过；未授权/错误版本保留原记录；解决结果可以审计。
- 阻塞项：B1/B2/B5～B10、R-D/R-E；正式冲突修订也影响 Formal。

### G5 — P1：桌面 hint、会话撤销与正常调度验收

- 缺口/模块：F4，desktop lifecycle/host、server WebSocket/session registry；现有 Pull 可复用。
- 前置依赖：现有会话/账号 cursor，G3；与 G4 业务层可分工推进。
- 推荐角色/最小实现：Runtime/Server Owner；hint 只触发普通 Pull，撤销断开 socket，旧窗口在下次认证请求锁定；startup/周期/网络恢复兜底保持正确。
- 最小验收：第二次登录撤销旧 token；旧 EXE 自动锁定且不提交迟到 ACK/cursor；漏 hint、WS 断开和重连后仍完整 Pull；关闭/换账号移除监听器且不重叠同步。
- 完成标准：真实 EXE 正常调度结果、server 撤销和 DOM 生命周期检查均留 SHA/run；不得拿独立 HTTP 客户端替代 EXE。
- 阻塞项：C7/C12 的撤销部分、R-B/R-C/R-E；不是重新测试已 CLOSED 的故障边界。

### G6 — P1：补齐已批准业务事件契约与下游投影

- 缺口/模块：F6，shared expenditure enum/validation、server mutation/audit/Pull、Rust payment/receipt/attachment projector 和现有 RFQ/child 接口。
- 前置依赖：已批准 T09 append-only 接口、T08 parent/child；附件消费 T11 接口，不能自己放开文件服务范围。
- 推荐角色/最小实现：T09/T10 Owners 分子片实施；先使合法 expenditure 不毒化混合 Push，保证 server 与接收方业务记录、append-only 更正；对已有 RFQ/child 先补边界证据，再按失败修改。
- 最小验收：两笔 Honsen payment 与 receipt 独立同步，断线/retry 不重复；owner mode 拒绝支付，原记录不覆写；RFQ/child/source-parent 依赖正确，坏引用回滚整页；附件引用待 T11 实件验收。
- 完成标准：共享 schema→server→另一端真实业务读模型贯通，失败/retry/conflict/immutability 回归及原生证据；不以 sync_entities 中有 JSON 充数。
- 阻塞项：R-A/R-E、T09，及 v1.0 协作/归档；不属于原始 SEC-001 owner 根因。

### G7 — P1：完成 T08/Formal 的业务不变量与必需快照

- 缺口/模块：F5，T08 OPA/HPA/SPO、trusted preissue conflict gate、rate provenance/附件冻结引用、克隆/re-key、T07 server approval-policy 对接；需要范围化迁移与字段保护。
- 前置依赖：G2/G4，原 T08 approval/namespace，T11 附件与 T12 输出按原验收接口协调；不能建立新的反向依赖掩盖原调度问题。
- 推荐角色/最小实现：T08/Formal Owner 主导，T07/security 对接权威策略；复用本地发号/registry，不重新发号，不允许自批绕过，不取消合法离线签发。
- 最小验收：不同 approver 的实际审批→离线签发→重连登记；unresolved conflict、缺 rate 不产生号/event；catalog/rate 改撤不改冻结原件；HPA/SPO 独立 namespace；并发/clone/re-key/碰撞/不同冻结快照保留原件；已批准自批政策由 server 独立核验。
- 完成标准：本地快照、server registry、接收方读模型与必要文件引用一致；正式拒绝可恢复；原生流程和业务输出独立验收。每个子片另立局部边界，不能一轮跨多工作树大改。
- 阻塞项：D1～D9、T08、Formal hold、T10-A/E 的 Formal 部分。T08 创建/冻结不是 T10 transport 缺陷，但仍属 v1.0 必需。

### G8 — P1 / BLOCKED：有审计的 legacy 恢复规则与验收

- 缺口/模块：NULL-owner outbox、旧 singleton cursor、server legacy_unverified origin/quarantine 的恢复与操作指引。
- 前置依赖：明确的归属证明、谁能恢复及失败路径批准；当前资料没有完整授权方案，必须交产品/安全/Sync Owner 决定。
- 推荐角色/最小实现：Security/Design Owner 先定义，Sync Owner 后实现；保留原件、不可猜 owner、不可改已接受历史；无证明可安全留 quarantine，但需明确其正式处置/恢复标准。
- 最小验收：旧 schema 升级/alias、NULL owner、原账号禁用/不存在、有/无证明恢复；无数据丢弃或 B 代发，完整原因/actor/前后来源审计。
- 完成标准：获准政策、必要实现/迁移和可信 SQLite/HTTP/native 证据；若选择长期隔离，须由原门所有者明确批准其是否满足关闭条件。
- 阻塞项：C12、SEC-001/P1；审批未获准时不得用技术 workaround 标完成。

### G9 — P1：独立集成安全与业务总验收（证据收口）

- 缺口/模块：跨 SHA/工作树的证据未收成一个可接受候选；相关 Native/DOM/API 测试和 QA 索引。
- 前置依赖：G1/G3/G5/G8 先给 SEC/P1 安全批次；G2/G4/G6/G7 后给协作/Formal 批次；原 prerequisites 分别满足。
- 推荐角色/最小实现：独立 QA/Fixer；只补缺少的实际业务/共享 profile 场景与证据归属，生产无新缺陷时不修改生产代码。
- 最小验收：A 离线事件→同安装 B 登录→A 返回；两个账号独立 cursor、迟到响应、旧 token/冲突归属；两个 installation 真编辑→明确解决→收敛；真实批准/issue/登记/碰撞/冻结不变。
- 完成标准：每个 acceptance ID 有候选 SHA、run、实际命令/结果及原件；原生与 mock DOM 分开；独立签署 SEC/P1/Formal 各门，不用某一批替代另一批。已 CLOSED NATIVE-008 等只在相关生产路径改变或新反证出现时才有理由重跑。
- 阻塞项：C12、R-B/R-D/R-E，及独立关闭批准；此任务本身不授权合并 main。

### G10 — P1：原始前置验收与可投入使用门

- 缺口/模块：T04-A/B/C 实际主数据与授权部署、T08/T09 父门、T11 归档边界、T12 文档、T14 最终 Windows 和 T15 安装发布的原始接受条件。
- 前置依赖：部署账户/窗口和边界决策明确批准，各已实现局部 evidence 与 G1～G9；不能为过 T10-F 重写依赖图。
- 推荐角色/最小实现：Integration Owner 协调各 parent Owner；本任务是原验收的收口计划，各生产缺口按原任务实施，不算新增 T10 网络功能。
- 最小验收：实际授权初始化与可复核合成证据分开；正常采购/审批/签发/收货、文件归档、冻结快照输出可用；所有必需受影响包/DOM/Rust/API/迁移/Windows 检查无未接受跳过。
- 完成标准：原 parent checkboxes 有直接证据，T10-A～F 独立正式验收；真实 v1.0 投入还要 T11～T15 原发布门，部署/发布另需授权。
- 阻塞项：R-F、Formal 和 v1.0 投入使用。不能用通过 sync 测试代替实际资料、文件或打印验收。

P2 建议：统一 SHA/run/场景/证据类型索引，修正文档中“singleton cursor”“无 RFQ projector”“无 pending counts”等已过时描述，保留历史失败和最终 CLOSED 的时间顺序。这是文档一致性工作，不能替代 G1～G10，也不应机械新增 NATIVE 编号。

## 8. 最短关闭路径与执行安排

1. **先选定 Q 后续的一个干净集成基线，执行 G1。** 现有源码修复可复用，依赖已在 Q，无需改 server 或开新数据库 schema。源/QA/main 的整合必须另按 Git 流程获准，不能把本报告当合并授权。
2. 优先解决 G2 正式读模型完整性；G3 拒绝策略、G8 安全恢复规则可独立推进。G1/G2/G4/G7 共用 Rust 大文件时按文件所有权串行集成，不能让“可并行”变成重叠写。
3. G1/G3 后做 G4 的生产选择/订单修订；G3 后做 G5 的调度/撤销。G6 的 shared/server 业务契约与 G7 的 T08 业务方案可分模块并行，消费方待契约稳定再接入。
4. **SEC/P1 可先独立收口**：G1、G8 和共享 profile/迟到响应/旧 token 的 G9 安全批次；若原撤销门未满足，先完成 G5 对应部分。不要把打印、全部支付或完整 Formal 业务任意加成 SEC-001 新条件。即使安全批次 PASS，仍须独立正式批准关闭。
5. **Formal 与协作闭环后收口**：G2/G4/G6/G7 加真实原生业务 G9；T08/Formal 业务与 T10 注册/投影各留证据。E0 的 server registry/hardening 证据可复用到原有未改边界；缺的是生产路径和完整链，不能只补一份报告。
6. 原始 T04～T09 门及全局检查收齐后，接受 T10-F，才可提出 T10 CLOSED。完成 T10 不自动接受 T11～T15 或授权部署。v1.0 投入实际多人离线使用须保留正式快照、文件/文档和 Windows 发布门。

**只需补证据的部分**：已实现 owner/cursor/离线 trusted guard、受限 RFQ/child 投影、已有 server approval/registry 的跨端组合与正常 UI 调度验证；须先处理关联安全缺陷。**明确需生产修改的部分**：G1、G2、G3、G4 的生产入口/订单流程、G5、G6 的缺失契约/投影、G7 的缺失业务字段/门/模式；G8 先需要规则。**不需要再开发或机械补测的部分**：E1～E7 已有的有界可靠性场景，尤其 NATIVE-008。

推荐下一轮只执行 **G1：在基于 Q 的一个独立任务分支集成 `031ad67` 的最小冲突 owner 保护并验收**。明确 PASS/FAIL：B 对 A-owned/NULL-owned keep/use 的任何一次成功、supersession、归属或版本改变即 FAIL；A-owner 合法解决失败也 FAIL；保留原冲突、正确新 event/source/base/reason、可见拒绝及独立 shared-profile 原生证明均满足才 PASS。不要同时开始 G2 或解除 parent hold。

## 9. 本轮验证、限制及交接

已执行：Git status/branch/HEAD/history/worktree/祖先关系、fetch origin main、定向 git show/diff/rg、相关工作树 status、指定已有 JSON 的只读解析和两份 QA 日志尾核对。报告完成检查为 Markdown 格式/矩阵行数与状态计数/证据引用/必要章节/仅文档 diff；其检查结果在最终交付说明记录。

未执行生产 lint/typecheck/unit/build/Rust/Playwright/native/PostgreSQL suites；原因是本轮只做证据审计，用户明确禁止全套测试、EXE 重建和启动数据库/容器。影响：本轮没有新候选的生产 PASS；只能使用 §3 各原 SHA 的历史局部结果。未执行 Toolbox 远端 preflight，因为没有修改应用、安装、更新、发布或契约。未改 schema/业务数据/测试、未运行迁移、未清理 QA/E2E、未推送/合并/部署；无辅助 Agent。

交接：应用审计基线 H、集成候选 Q、main M 均固定为 §1 SHA；文档检查点为包含本报告和 memory 审计交接条目的本地 commit，最终消息给出 SHA。完成后保留两处原有未跟踪证据目录。**BLOCKER**：F1/F2 以及矩阵未关闭的必需验收门和明确依赖；**DEFERRED**：G1～G10 下一轮实施/补证据，未经授权不开始；**WARNING**：跨工作树/不同 SHA 的测试不能移作 H 或 main 验收，旧文档状态有滞后。NATIVE-008 不新增关闭条件。

## 10. 必须明确回答的五个问题

**A. T10 是否可以 CLOSED？不可以。** Q 的原始 A～F 完整通过为 0/6；H/main 更未装配 Q 的关键安全与正式功能。可靠性 PASS 不替代原依赖、业务投影、冲突解决及原生全链。

**B. T10-SEC-001 是否可以 CLOSED？不可以，保持 OPEN。** Q 仍有可达的冲突来源重包装缺陷，legacy 恢复规则/验收和真实同安装换账号矩阵未收口，且无正式关闭批准。

**C. P1 是否可以 CLOSED？不可以，保持 OPEN。** 原始队列 owner 问题已有部分 containment，但 resolver 绕行、来源恢复与独立账号切换验收未清；不能因 NATIVE-008 CLOSED 改变。

**D. Formal hold 是否可以解除？不可以，保持 OPEN。** Server 原始 trust-boundary 修复的局部证据有效；正式 Pull 快照、OPA/HPA/SPO 完整业务、权威审批策略/冲突 gate、真实 EXE Formal/RFQ 和原 parent 验收仍欠缺。

**E. 距离 v1.0 可投入真实多人离线使用，还差什么？** 首先修复跨账号冲突来源与正式快照投影两个完整性缺口；然后完成可操作的生产订单冲突解决/修订到双方收敛、结构化拒绝与会话调度、业务事件/收货支付附件投影，以及完整审批和本地离线签发→server 登记→另一端冻结读模型。补齐真实共享安装/多 installation 安全和业务证据，接受 T04～T09 原门、T11 文件/T12 输出和最终 Windows/发布验收后，才能提出投入使用；这些需求没有获准移至 v1.1。
