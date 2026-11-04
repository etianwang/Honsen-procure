# 安装目录 P1 有限修复审批方案

2026-11-04；仅方案，未批准实施。核对源码 `d58d5097cae226b01aeb55732d983f2639191b1d`。解除 HANDOVER_FREEZE、commit/push 授权不替代本项合同冲突批准；不授权合并、正式 Release、生产操作。

## 已确认事实与影响

依据远端 `codex/rc-stabilization-toolbox-preflight-20261025` 的 `RC-STABILIZATION-TOOLBOX-APPROVAL-20261025.md` 和交接 RC-INVENTORY/RELEASE-BLOCKERS。冻结 `f4756af` 的 0.1.2 安装器在隔离 Windows 中以 Unicode/空格 `/D` 安装，主文件与卸载器/登记分裂，Runner launch 找不到登记目录的 manifest。这是历史 RED，不是本机重现或新构建验收。

当前代码仍存在两处成因：`apps/desktop/src-tauri/src/update_runner.rs::run_elevated_installer` 用 Inno 参数调用 NSIS；`apps/desktop/src-tauri/packaging/windows/toolbox-hooks.nsh::NSIS_HOOK_PREINSTALL` 在 Tauri 设置输出目录后修改 `$INSTDIR`，并试图从已经移除 `/D` 的 `$CMDLINE` 判断显式路径。只修改其中一处不足以修复。

五个上游 Toolbox 来源已按 AGENTS 顺序通过 GitHub 集成重读。与 `docs/HONSEN_TOOLBOX_INTEGRATION.md` 比较：目录分裂/私有 NSIS adapter 为本次请求；非 canonical 更新 URL、launch 更新选择、Toolbox launch 附加参数与缺少 apply 路径仍独立阻塞，不借此修改。

## 请求批准的精确边界

1. Runner 私有参数构造使用 `/S /D=<验证后的绝对原 InstallLocation>`，`/D` 最后且不加引号；保留 Unicode/空格，拒绝 NUL、CR、LF、引号。不得从 renderer 接受新目录。保留 UAC、原目录、SHA-256、PID、身份和安装后版本核验及失败不重启。
2. 删除晚期目录改写宏和其 PREINSTALL 调用。为锁定 Tauri CLI 2.12.2 获取并记录精确上游 NSIS 模板/许可证/SHA-256，经核实配置支持后接入自定义模板，仅修改默认目录分支为 `Program Files/Honsen Program/Honsen Procure`；保留架构分支、NSIS 显式 `/D`、已登记旧目录恢复、目录页面和其余上游行为。不得拿旧生成缓存脚本充当源模板。
3. 在既有 installerLogPath 创建 adapter 实际调用、时间、退出码和错误记录；明确不是 NSIS engine log，不新增/重命名公开结果字段。日志不得写凭据。

身份、EXE/Runner 名称、Tauri identifier、machine 范围、注册表键及字段、Manifest schema/值/更新 URL、公开 Runner 参数、result JSON、可变数据根和卸载边界全部冻结。没有数据库迁移或业务数据迁移。

## 旧版与回滚边界

有效旧登记更新必须使用原目录，不迁移目录、不创建第二实例。登记与文件已经分裂、登记过期或存在冲突时必须安全失败并保留证据；本方案不授权自动猜测真实目录、修复登记、移动旧文件或清理残留。需要这些恢复行为时单独报告并审批。

当前 Runner 安装后复核成功才重启，未实现可宣称的自动二进制回滚；本方案不新增自动回滚。新候选失败即停止验收/分发，保留旧冻结资产与日志，在 disposable guest 恢复干净快照重试。不得用重装、降级或恢复数据库假称回滚成功；生产恢复另行授权。

## 最小文件集合（获批后）

- `apps/desktop/src-tauri/src/update_runner.rs`：私有 helper、adapter 日志及同模块定向单元测试。
- `apps/desktop/src-tauri/packaging/windows/toolbox-hooks.nsh`：仅移除晚期目录变更。
- `apps/desktop/src-tauri/packaging/windows/installer-template.nsi`（拟新增）：经哈希核实的固定上游模板与最小默认目录差异。
- `apps/desktop/src-tauri/tauri.conf.json`：仅 NSIS template 引用。
- 现有隔离 Windows 安装观测脚本/证据目录：扩展目录断言；首次准备时确认实际仓库位置，不将旧 E 盘路径硬编码进脚本。
- `docs/HONSEN_TOOLBOX_INTEGRATION.md` 与现有任务记录：实际源 SHA、模板 hash、构建 hash、OS、命令和结果；父门禁保持未完成。

不修改 Manifest 生成器、build-windows-release 默认 URL、Toolbox 仓库或 catalog；不升级依赖/重写 lockfile。若模板核实需要更广配置变化，停止并重新列范围。

## 验收与证据要求

先跑 focused Runner 参数与日志测试：空格/中文、显式 former-default 路径、非法字符、退出错误/UAC/超时日志，以及原有 target/hash/PID/版本失败不重启。然后运行受影响的 format/lint/typecheck/unit/build/Rust 门禁；准确记录 Windows-only 检查的实际平台，不把跨平台单元 PASS 当安装 PASS。

对新固定 SHA 构建新候选，独立记录 setup/Runner/manifest SHA-256；旧资产不覆盖。仅在全新 disposable Windows guest 检查默认安装、Unicode/空格显式目录、显式路径等于旧默认值、有效非默认登记升级、失效/冲突登记拒绝。每次断言 EXE、Runner、manifest、uninstall.exe、Honsen 登记和 Windows 卸载登记位置一致；实际通过 Runner apply 更新、失败无重启、卸载保留合成用户数据/共享父目录/兄弟产品。没有真实执行的项目一律 NOT RUN。

本次方案审阅未运行安装/更新/卸载，没有新增实测 PASS。此前 `node --test tests/release/linux-package.test.mjs` 3/3 PASS 只证明 Linux 包静态结构，与本 Windows P1 验收无关。

建议批准用语：批准本文件“精确边界”三项成对修复及限定文件/隔离验收；不批准 URL、公开协议、身份、数据边界、自动旧安装修复或发布。批准前状态为 BLOCKER；其他 Toolbox 差距保持 DEFERRED/独立生产门禁。
