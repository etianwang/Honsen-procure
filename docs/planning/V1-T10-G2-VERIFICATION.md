# T10-A / G2 Formal Pull Verification

审计日期：2026-10-20。此记录核实 G2 的历史独立 QA 与当前候选的关系；它不改变 `BUILD-TASKS.md`、`ROADMAP.md`、`memory.md` 的正式状态。

## 结论

**选择 A：已实现且已验证；不需要生产代码、迁移或补测。**

G2 历史 CLOSED 与“当前分支/main 尚未集成 G2”不矛盾。前者是对 **`6e0a2a61fdf0967d75dc5edec3eed5e350056ef5`** 的受限独立验收，后者是 Git 集成事实。先前 V1 审计把“当前候选没有该提交”错误提升为“G2 生产功能缺口/P0”；应将其改为：**G2 的 16-field OPA Formal Pull slice 已关闭，可在选择该候选或集成该提交时复用；当前 P0 是将经验证候选纳入单一 RC 的集成与其余 T10/T08 业务门，而非重新开发 G2。**

本工作树基于 `25a56af0aef635be7e1ab0a878784c53a87fac49`，分支 `codex/t10-g2-status-audit`。`git merge-base --is-ancestor 6e0a2a6 25a56af` 和对 `origin/main` 的同一检查均返回非零：G2 实现不在当前候选或 main。没有修改应用代码。

## G2 CLOSED 的精确范围

独立验收记录在 commit **`ff7bff6f421cb71448deff017bba7a8f0485070a`** 的：

- `docs/agent-coordination/QA_REPORT.md`，T10-A/G2 的 exact value matrix 和 native run `native-smoke-20261019145156`；
- `docs/BUILD-TASKS.md`，`T10-A / G2 independent acceptance — CLOSED`；
- `memory.md`，`T10-A/G2 Independent QA — PASS / CLOSED`；
- `docs/planning/V1-DELIVERY-CLOSURE-PLAN.md`，G2 仅为受限 16-field OPA Formal Pull scope 的说明。

它覆盖来自真实 HTTP Pull 的 OPA 已签发采购单、第二个真实 EXE 的 SQLite projection、重启和空 replay，不关闭整个 T10-A/E、T10、T08、Formal hold、G1 UI、G3–G10 或发布门。

## 代码核实

实现 commit 为 **`6e0a2a61fdf0967d75dc5edec3eed5e350056ef5`**：

| 要求                          | 实现位置                                                                                               | 结论                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6 个正式头字段                | `apps/desktop/src-tauri/src/lib.rs:684-725` (`RemotePurchaseOrderPayload`)；`7730-7933` (projector)    | 已实现：`document_type`、`formal_document_no`、`formal_installation_id`、`formal_sequence`、`formally_issued_at`、`formal_snapshot_json`                    |
| 10 个 owner 行冻结字段        | `apps/desktop/src-tauri/src/lib.rs:747-894`（remote line validation）与 `7916-7917`（SQLite update）   | 已实现：quote source、catalog price id、manual reason/actor/time、source price、locked rate、converted reference、markup JSON、final price                  |
| approved / confirmed → issued | `apps/desktop/src-tauri/src/lib.rs:759-894`、`7730-7933`                                               | 已实现并验证 editable order 向 issued 的一次性冻结推进；已 issued 重放不会改写冻结行                                                                        |
| 空库 / 已有订单 Pull          | `apps/desktop/src-tauri/src/g2_pull_tests.rs:168-231,358-415`                                          | 已覆盖 cold file、existing approved/confirmed、first issue replacement、replay/restart                                                                      |
| 错误页 cursor 原子性          | `apps/desktop/src-tauri/src/g2_pull_tests.rs:272-332,481-534`；page transaction 位于 `lib.rs:5393-...` | 无效 DTO、SQLite collision/cursor fault、divergent issued payload 都回滚且不前进 cursor                                                                     |
| 目录/报价/汇率不改正式快照    | `apps/desktop/src-tauri/src/g2_pull_tests.rs:67,142,236-268`                                           | 用失效的 current CNY quote `999999` 验证 staged formal snapshot；QA native proof 另将当前 quote 改为 `9999`，原 source/rate/converted/markup/final 保持不变 |

G2 测试文件共有 12 个有名场景，涵盖正式字段完整性、replay/restart、approved/confirmed 进展、staging、无效 DTO、post-approval price timestamp、首签发、line order、legacy backfill、跨 profile issue、SQLite collision/cursor rollback、divergent snapshot 与 dirty local conflict。

## 证据与本轮定向复验

历史独立 QA（`ff7bff6`）的最终真实运行：

- Native：`native-smoke-20261019145156`，两个真实 EXE / Fastify HTTPS / SQLite / disposable PostgreSQL；issuer 正常审批并正式签发，consumer Pull/restart/replay。
- 实测字段：6 headers + 两条线的 10 owner fields；冻结 catalog source `1234`、rate `76.5`、converted `944`、fixed markup `20`、final `964`，以及 manual `1000/1/1000/10%/1100`。
- QA 判定：PASS / G2 CLOSED，仅限上述 scope。

本轮未重复 Native 全矩阵；在干净的既有 G2 implementation worktree 上重跑最小相关测试：

```text
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib g2_pull_ -- --nocapture
```

结果：**12 passed, 0 failed, 69 filtered out**（2026-10-20）。Rust linker 输出有既有 warning，测试结果不受影响。未运行无关的 NATIVE-002–008、整仓构建或发布测试。

## 对 V1 排程的影响

- 不应重做或重新排为 G2 生产修复。
- 将 G2 标为“已验证但未进入 current/main integration baseline”；以后建立 RC 时，必须以选定合入后的单一 SHA 重新做边界比较，不能把候选证据直接等同为 main 发布证据。
- 仍阻塞 V1 的 T10 项是 G3（结构化永久失败）、G4（生产冲突收敛）、G5（desktop lifecycle）、G6（receipt/payment projection）及 G8（获批 legacy recovery policy）；T08/T11–T15 的原始门仍不变。
- 下一项最有价值的开发任务是 **T10-B / G3 structured outcomes**，前提是选定包含 G2 的集成基线。它使 validation/permission/auth/transport/temporary failure 可区分、不会饿死 outbox，且不重复 G2。
