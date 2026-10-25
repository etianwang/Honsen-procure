# V1 Prioritized Backlog Proposal

这是按真实依赖排列的建议队列，不修改原始 T00–T15、G1–G10、任务状态或验收门。每个生产任务应在独立 `codex/` 工作树中完成一个最小可验证切片；共享 `apps/desktop/src-tauri/src/lib.rs` 的 T10 切片必须串行整合。

| 顺序 | 任务 | 当前状态 | 依赖 | 最小范围 / 不做什么 | 最小验收 | 阻塞 V1 | 独立工作树 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | T10-A / G2 Formal Pull preservation | IN PROGRESS | 既有 formal schema/registry；选择干净集成基线 | 投影 6 个正式头字段、10 个 owner 行冻结字段、approved→issued；不重写 registry、不做 G3/G4 | 空库和已有 approved 的接收端 Pull 后字段逐一一致；坏页回滚 cursor；目录/汇率变化不改正式件 | 是，P0 | 是；Rust 文件独占 |
| 2 | T10-B / G3 structured outcomes | NOT_STARTED | 现有 Push ACK；G2 可并行设计、整合串行 | 持久区分 accepted/conflict/validation/permission/auth/transport，永久失败不饿死队列；不重写全部 sync | 混合 batch、400/401/403/503、retry/ACK/可见错误回归 | 是，P1 | 是 |
| 3 | T10-D / G4 production conflict convergence | IN PROGRESS | G3；订单 formal 分支消费 G2 | 真实路由中比较、理由、审计、revision/new outbox 和双端收敛；不原地修改冻结件 | 两 installation 离线并改→conflict→管理员处理→双方业务读模型一致 | 是，P0 | 是，但等前两项整合 |
| 4 | T10-C / G5 desktop lifecycle | NOT_STARTED | 账号 cursor/session guard，G3 | startup/reconnect/periodic Pull、WS hint 触发 Pull、revocation lock；不让 WS 传业务数据 | miss hint/reconnect/second login/late response 的真实 EXE 证明 | 是，P1 | 是 |
| 5 | T10-SEC-001 / G8 legacy policy | BLOCKED | 产品/安全负责人书面策略 | 定义并实施 NULL-owner/old-cursor/unverified-origin 隔离或审计恢复；不猜 owner、不清数据 | 升级/有无证明/禁用账号的保留与审计用例 | 是，P0 | 先否；获批准后是 |
| 6 | T09 + G6 receipt/payment sync | IN PROGRESS | G3；T11 仅消费附件实体 | receipt、expenditure、reversal 的 shared→server→Pull→业务读模型；不实现文件服务 | 两次收货、两笔付款/更正、owner payment denial、retry 不重复 | 是，P1 | 是 |
| 7 | T08-B/C/D Formal execution closure | IN PROGRESS/BLOCKED | G2/G4、T07 policy、T11 frozen refs 后续 | HPA/SPO、pre-issue conflict gate、clone/re-key、审批到签发；不重新实现已验收 OPA draft | 审批→离线签发→登记→接收端冻结读模型，碰撞保留原件 | 是，P1 | 是，需与 T10 接口冻结后 |
| 8 | T04 category + deployment-ready master data | PARTIAL | T02/T03；实际数据需授权 | category CRUD/soft-delete 和确有缺口的 REST→Pull；不改 seed 代替部署 | Rust/API/DOM，授权 seed idempotency/rollback，角色/默认值检查 | 是（最终）、不阻塞 1–7 | 是 |
| 9 | T11 files | NOT_STARTED | 外部 COS config/authority；T09 metadata | 摄入、类型/100MB/200MB、压缩、离线队列、server-issued upload、archive ACL；不把路径信任交给 renderer | 拒绝/允许 fixture、重启 retry、receipt link/authorization | 是，P1 | 是 |
| 10 | T12 frozen PDF/print/Excel | NOT_STARTED | 稳定 snapshot interface；T11 header/attachments 可后接 | 离线双语 A4、Excel、pagination、owner redaction；不重算历史金额 | preview/PDF/physical print、重印一致、翻译缺失阻断 | 是，P1 | 是 |
| 11 | T13 operability and governance | PARTIAL | account/data interfaces；TOTP/backup design | backup/restore retention、完整 i18n、enabled TOTP/reset audit、真实首页队列/a11y；不做新角色模型 | backup round trip、offline TOTP、locale keeps draft、role-scoped queue | 是，P0 对 backup；其余 P1 | 可分为 backup、TOTP、i18n 三工作树 |
| 12 | T14 integrated RC acceptance | evidence-only | T04–T13 | 以单一候选 SHA 做必要的真实跨端/安全/业务/打印验证；不追加功能 | TEST-RULES 与原 acceptance 有可追溯 run/SHA | 是 | 是（QA tree） |
| 13 | T15 packaging/release | NOT_STARTED/BLOCKED | T14、Toolbox contract、发布授权 | installer/Runner/manifest/registry/update/uninstall；不臆造 identity/signing/release URL | install→Toolbox launch→bad update fails safely→uninstall retains data | 是，P0 | 是；需 Toolbox preflight |

## 推荐并行边界

可以并行准备：T04、T11、T12 的模板基础、T13 的各独立服务。不能并行写同一 Tauri sync/order projector：G2、G3、G4、G5、G6 应按接口和文件所有权串行合入。任何任务完成都不能自动关闭 T10、Formal hold 或父任务。

## 立即建议

启动 **T10-A / G2 Formal Pull preservation**。它直接修复已签发订单在另一设备上无法完整、不可变地还原的 P0 数据完整性断点；现有 schema/registry/投影路径可复用，不等待部署授权、COS 或打印。最小实现仅限准备范围中的 6 个 header + 10 个 owner-line 字段及已批准状态推进，验收为双起点 Pull、坏页 rollback 和冻结不变性。完成后独立复核；不同时开启 G3/G4。
