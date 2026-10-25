# Honsen Procure V1 Delivery Readiness Audit

审计日期：2026-10-20。范围为只读代码、Git、任务记录和既有 QA 证据审查；本文件是建议，不修改 `BUILD-TASKS.md`、`ROADMAP.md`、`memory.md` 的正式状态。

## 审计基线与方法

| 项目 | 结果 |
| --- | --- |
| 当前分支 / HEAD | `codex/qa-fix2-g2-preparation` / `25a56af0aef635be7e1ab0a878784c53a87fac49` |
| 与 `origin/main` | 当前分支领先 26、落后 0；`origin/main=5139cc8` |
| 工作树 | 两个已存在的未跟踪证据目录：`.honsen-e2e/`、`apps/desktop/src-tauri/.honsen-native-e2e/`；未修改或删除 |
| 分支事实 | 26 个未合并提交包含主数据编辑/服务端投影、REST→Pull 和 cursor 顺序修复，以及审计文档；它们尚未进入 `main`，不能作为 main 的发布能力 |
| 运行验证 | 本轮未运行构建、迁移、Docker、Tauri 或 E2E；使用每条既有证据所对应的 SHA，未把跨工作树证据提升为当前 HEAD/main 结论 |

已检查 `AGENTS.md`、`memory.md`、PRD/SPECS/ARCHITECTURE/DATABASE/SYNC-PROTOCOL/SECURITY/TEST-RULES/DECISIONS、ROADMAP、BUILD-TASKS、V1 closure plan、T10 audit、QA_REPORT、BUG_QUEUE、实现代码、测试和 Git 图。

关键证据边界：`G1-QA-001` 对候选 `13b22ff` 的 management-401 修复已独立 PASS；但该候选不是 main，也不关闭 G1 的生产冲突 UI。NATIVE-008 已关闭。T10、T10-SEC-001、原始 P1 和 Formal hold 均保持 OPEN。当前审计无权改变这些状态。

## V1 范围裁定

PRD/DECISIONS 把离线采购、审批、两种采购模式、正式编号/冻结快照、RFQ、部分收货、Honsen 付款记录、附件、PDF/打印/Excel、备份、完整三语言、权限/TOTP、同步和 Windows 发布都列为生产范围。因此它们不能仅为赶发布而移到 V1.1。

以下不是 V1 新缺口：通用库存台账、库存出入库/库存流水、总账、支付网关、供应商门户、OCR、实时汇率、移动端均在 `docs/DECISIONS.md`/PRD 的 Deferred 或 Out of scope。V1 的“到货”是采购订单的收货数量与状态，不是库存子系统。

## 功能审查矩阵

状态定义：DONE=实现且有足够、范围相符证据；PARTIAL=存在真实实现但闭环或证据不完整；NOT_STARTED=未发现生产闭环；BLOCKED=外部决定/必要前提阻断；UNKNOWN=现有材料不足。

| 模块 | V1 必要性 | 当前实现 | 实际证据 | 缺口 | 建议 |
| --- | --- | --- | --- | --- | --- |
| 登录、离线登录、角色基础 | 必须 | PARTIAL | Rust 本地 Argon2/CAPTCHA/锁定、server session、T02/T03 有界验收 | server `AuthService` 接受但未验证 `totpCode`；完整账户治理/真实多账号桌面证据未闭合 | 放入 T13；不把基础登录重做 |
| 权限与会话撤销 | 必须 | PARTIAL | G1-QA-001 在 `13b22ff` 的独立 Rust/API/真实 EXE 证据 | 生产 conflict UI 生命周期、共享 profile/迟到响应/legacy 恢复未验收 | 先保留 Formal/SEC hold；按 T10-D/C/G8 收口 |
| 材料、供应商、报价、图片 | 必须 | PARTIAL | 本地 CRUD、价格历史、图片裁剪、搜索、T05 证据 | 分类维护 command/UI 未发现；部分远端发布/部署/双客户端验收缺失 | T04：补类别最小闭环和已知 publication 缺口 |
| 主数据、税率、汇率、项目默认值 | 必须 | PARTIAL | 当前分支含 local editor、PostgreSQL projection、cursor 顺序相关测试 | 授权初始数据/部署权限、全部 REST→Pull、原生多客户端和角色验收 | 不阻塞独立 T10 功能；作为 T04/T14 前置收口 |
| 申请、审批、修订、审计 | 必须 | PARTIAL | T06/T07 本地草稿、提交、审批、修订/审计和 self-approval 基础 | 实际业务全旅程、拒绝/复制、server 权威政策联动和生产冲突修订未完成 | T08/T10-D 以真实生产路由接通 |
| OPA/HPA/SPO 正式签发 | 必须 | PARTIAL | 本地 owner 定价/草稿、RFQ/子单/部分 formal 基础在候选分支 | 完整 HPA/SPO、签发前冲突门、服务器注册/拉取不变量、clone/re-key 和真实流程 | 先修 T10-A，再完成 T08-D/T10-E |
| 收货、付款、订单状态 | 必须 | PARTIAL | Rust `record_receipt`、partial receipt、outbox 和 ReceiptPanel；append-only expenditure 基础 | 完整 UI/状态/冲销/凭证，付款同步契约，附件实件 | T09/T10-G6；不可用库存功能替代 |
| 库存查询/出入库/流水 | 不属于 V1 | NOT_STARTED（正确） | `DECISIONS.md` 明确 Deferred | 无 | 维持 V2/backlog，不增加 V1 工作 |
| 项目关联与材料追踪 | 必须（订单级） | PARTIAL | project/site/team/schema、catalog/order snapshots | 已签发订单 Pull 与跨端读模型不完整 | T10-A 后用实际订单验证 |
| Outbox、Push/Pull、冲突 | 必须 | PARTIAL | SQLite 事务 outbox、server idempotency/cursor、部分 native reliability、NATIVE-008 | 正式快照 Pull、永久错误分类、production conflict convergence、WS desktop 编排、业务 projectors | T10-A→B/D/C/E，维持安全门 |
| 附件/归档 | 必须 | NOT_STARTED | attachment metadata/receipt link 存在 | 本地摄入、压缩、限额、离线队列、COS upload/授权归档 | T11；需解决 T09-C 联合验收边界 |
| PDF、打印、Excel | 必须 | NOT_STARTED | 需求和部分数据模型存在 | 无生产 print/export center；冻结快照、翻译、owner redaction 未验收 | T12，不能降级为“仅页面存在” |
| 三语言、首页工作队列 | 必须 | PARTIAL | React 路由/页面存在 | `HomePage.tsx` 为硬编码演示订单和计数；没有完整 message catalog | T13；属于真实业务可用性缺口 |
| 备份、恢复、运维 | 必须 | NOT_STARTED | 规范/迁移约束已定义 | backup/restore、十日保留、restore audit/drill 未实现证据 | T13/C；生产前必须完成 |
| 部署、初始管理员、数据初始化 | 必须 | BLOCKED | migration/seed 能力、部署约束文档存在 | 缺授权部署账户/实际初始记录/运行演练 | 需要业务/运维授权；不可由代码猜测 |
| Windows 安装、更新、卸载 | 必须 | NOT_STARTED / BLOCKED | 身份已批准；Tauri README 明示 `bundle.active:false` | installer/Runner/manifest/registry/签名与 E2E 均不存在；发布决策未批准 | T15；实施前必须 Toolbox preflight 和发布授权 |

按 14 个实际 V1 模块计：0 个 DONE、9 个 PARTIAL、3 个 NOT_STARTED、1 个 BLOCKED、1 个混合 PARTIAL/NOT_STARTED（发布）。这不是百分比完成度：现有任务是大小不等的垂直切片，且 9 个原始任务仍未关闭。若仅以“可交付业务闭环”加权，当前没有完整、可部署 V1 闭环，故不能合理声称一个发布完成百分比。

## 用户闭环审查

| 闭环 | 状态 | 可实际运行部分 | 发布级断点 / 临时替代 |
| --- | --- | --- | --- |
| 材料→报价→申请→审批→订单确认 | PARTIAL | 本地 catalog、报价、草稿、审批和修订基础存在 | OPA/HPA/SPO 的真实端到端签发、拒绝/复制、跨端 conflict/revision 仍缺；不能用手工改库替代 |
| 订单→到货验收→收货状态 | PARTIAL | 收货记录、累计数量、超收原因的 trusted Rust 路径存在 | 完整生产 UI、附件、跨端 receipt projector/业务读模型未完成；可暂以本地受控收货验证，但不可宣布多设备闭环 |
| Honsen 付款→更正→同步 | PARTIAL | 本地 append-only expenditure 基础 | server 契约/投影、production UI、reversal/voucher 验收缺口；没有安全的临时“已同步”替代 |
| 离线创建→恢复网络→Push/Pull→多端一致 | PARTIAL | transaction outbox、idempotent Push/Pull、cursor/部分 native evidence | G2/G3/G4/G5/G6/G8：冻结字段丢失、错误队列、production resolver、desktop WS、支付/收货投影、legacy policy；不能发布为可靠多设备协作 |
| 部署→初始管理员→客户端登录→首笔真实业务 | BLOCKED | migration/seed/账号基础代码 | 未获部署和初始数据授权，且没有 installer/release artifact；没有可接受的临时替代 |

## QA 与缺陷分级

### P0 — 实际发布阻断

- **T10-A/G2：正式订单 Pull 未完整投影冻结编号、归属和 owner 行快照。** 另一客户端可能无法得到可重印、可审计的已签发业务读模型；这是数据完整性问题。
- **T10-D/G4：生产订单冲突解决/修订未形成两端收敛。** 现有 fixture/命令不等于真实业务入口；若发布将留下冲突无法安全处理的采购记录。
- **T10-SEC-001/G8：legacy owner/cursor/origin 的恢复政策和可验证路径缺失。** 不能猜 owner、清 pending 或让另一账号代发；这既是授权又是数据保全风险。
- **无可部署、可验证的发行路径。** T15 installer/update/uninstall 未实现，T13 backup/restore 未证实，初始管理员/部署未获授权；不能安全让真实用户开始使用。

### P1 — 仍是 V1 必需，但可按依赖排程完成

- G3 permanent/validation/auth/transport 的结构化结果和 outbox 不饿死后续事件。
- G5 desktop WS、网络恢复与 revoked-session 正常调度。
- G6 receipt/payment/RFQ/attachment 事件契约与端到端投影。
- T08 完整 HPA/SPO、formal pre-issue gate、号码/冻结快照业务验收。
- T11 附件，T12 PDF/print/Excel，T13 TOTP/三语言/真实首页/备份。

### P2 / 可延后

- Harness 重构、额外非必要故障组合、视觉美化、非关键性能和文档索引整理。
- 已明确不在 V1 的库存、总账、支付网关、供应商门户、OCR、实时汇率、移动端。

## T10 专项判断

1. 可用能力：有 transaction outbox、authenticated Push/Pull、idempotency、cursor、conflict records/resolver 基础、部分 server registry、NATIVE-008，以及候选 `13b22ff` 上已独立验证的 management-401 修复。
2. 足够的真实运行证据：NATIVE-008 的既有范围；`13b22ff` 的 `native-smoke-20261019115437` 和定向 Rust/API 仅覆盖 management-401。二者均不可升级为当前分支/main 的全部 T10 证据。
3. 真正阻碍 V1：G2、G4、G8、部署/备份/发布路径；同时 T10 的 G3/G5/G6 是完成可靠协作的必要工作。
4. 可延后至 V1.1：仅不改变可靠性与权限安全的额外测试矩阵/Harness/UI polish；不能延期 G2/G4/G8、冻结快照、冲突保留或正式发布安全门。
5. 可继续其他 V1 模块而不等 G4 全部关闭：可以。T11、T12、T13，以及 T04 的独立类别/发布路径可在不改冲突语义的情况下开发；但它们不能让 T10 或 V1 关闭。
6. 安全延期：不能把有未解决冲突/legacy 归属的普通采购模式发布为可协作模式。只有得到正式批准的只读/禁用同步写入运营模式、并仍保留本地证据时，才可能隔离受影响历史数据；当前没有该批准，故不建议此路径。

## 文档/证据矛盾与需要裁决的事项

- 当前 `BUILD-TASKS.md` 说 `13b22ff` 的 FIX2 已独立关闭，但同时明确它没有合入当前 H/main；两者并不冲突，风险在于阅读者可能误把候选结果算进 main。发布候选必须重新建立单一 SHA 证据表。
- `T09-C` 依赖 T11，而 T11 原表又依赖 T09。既有建议是 T09 负责 receipt-to-attachment metadata，T11 负责摄入/上传/归档，最后做联合证明；此边界尚待批准，不能擅改依赖。
- `T10` 的历史总数/完成文字跨 SHA 有滞后。审计采用当前 delivery register：9 个原始 ID 未关闭、8 个需开发、T14 是最终证据任务。
- 在产品负责人明确批准前，不能把 V1 的附件、打印、备份、三语言、收货/付款或发布门移至 V1.1。
