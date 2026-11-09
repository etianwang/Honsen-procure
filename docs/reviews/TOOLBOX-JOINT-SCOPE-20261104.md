# Toolbox 联合验收剩余范围

只读审查，2026-11-04，Procure 基线 `382f2de`。P1 目录/NSIS adapter 已关闭，不重新修复或重测。本文件不是实施批准、发布或 Toolbox 接入许可。

## 来源与实际差距

已按 AGENTS 顺序重新读取 Toolbox main 的 README、HONSEN_WINDOWS_APPLICATION_STANDARD、honsen-desktop-update-protocol、toolbox-integration-contract、honsen.app.schema.json；另读取实际 MainWindow.xaml.cs。标准 §7.1 明确 launch 校验后检查 stable 更新，提供立即更新、稍后提醒、跳过此版本；§10 要求 Toolbox 检查更新仅比较版本，更新下载并校验后调用 apply。较简略 update-protocol 未重复 launch 交互，不表示可忽略统一标准。

| 边界           | 当前实现 / 影响                                                                                                                                                                                                                           | 合同内可行修复与授权边界                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 更新源         | scripts/build-windows-release.mjs 默认和 toolbox-hooks.nsh 常量仍为 releases/latest/download/manifest.json；生成自定义 appId/version/installerUrl/sha256 JSON。Toolbox GetLatestVersionAsync 解析 GitHub Release tag_name，响应形状不兼容 | 正确目标是已批准仓库的 canonical `https://api.github.com/repos/etianwang/Honsen-procure/releases/latest`。这符合既有规范，但直接改变受保护 Manifest/registry URL 值及其消费者，须用户精确批准后成对修复；不得只替换一处字符串。 |
| Procure launch | update_runner.rs::launch 忽略 source，校验部分身份/路径后直接 spawn 主 EXE；没有 stable 查询/选择流程                                                                                                                                     | 在既有 launch 参数内增加所需流程，无需新增公开参数或 result 字段；仍是改变已冲突公开行为，先批准范围和最小交互/离线策略。不能先私自实现或把网络失败当已有更新。                                                                 |
| Toolbox 打开   | MainWindow.xaml.cs 给 launch 附加 --wait-pid、--operation-id、--result-path；Procure parse_launch 严格只收 --app-id 与 --source                                                                                                           | 首选在 Toolbox 仓库修正调用者为现有准确命令，避免扩 Procure parser。Procure 不应容忍这些错误字段掩盖跨库缺陷。跨库修改须明确授权与独立分支；若要求正式支持附加字段，则先统一协议，当前无此批准。                                |
| Toolbox 更新   | MainWindow.xaml.cs 未见第三方 Runner apply 调用路径，integration-contract 也明确记载该差距                                                                                                                                                | 在 Toolbox 内按已有 apply 十参数/唯一结果路径实现下载、GitHub digest 校验、等待、结果与登记复核；不改 Procure公开协议。需要 Toolbox 仓库实施授权及测试资源，Procure本库无法单独完成联合验收。                                   |
| 接入与发布     | 现无合格 stable 资产/联合验收证据可据以启用 Procure catalog                                                                                                                                                                               | 本地合成HTTP响应与隔离guest可测行为，但不等于真实 stable API/Toolbox UI 验收；不得为了验证发布正式 Release、添加 catalog 或启用自动安装。                                                                                       |

## 建议的三个独立有限批准

1. **更新源闭环**：仅批准 canonical Release API URL 同步到生成/构建输入、安装登记和 Manifest；按 stable tag、唯一版本安装资产及 GitHub `sha256:` digest 解析并严格校验，测试 malformed/draft/prerelease/missing digest/network failure。Manifest字段名、schemaVersion、appId、身份、注册表路径、数据和卸载边界不变。历史已安装自定义 URL 不得自动猜测或修登记；需要迁移时另报方案。
2. **launch 既有行为补齐**：不改公开参数，在可信 native 边界完成 stable 查询及立即/稍后/跳过选择；立即更新复用同一 apply 安全链，稍后/跳过启动已验证本地 EXE。离线和源失败的可理解提示、是否继续本地启动及跳过状态存放应列为批准内具体决策，不虚构旧行为。禁止将 source 用作授权，renderer不获得任意进程/目录执行权。没有该明确批准前不修改 production Runner。
3. **Toolbox 调用者合规**：明确批准在 Toolbox 仓库移除 launch 额外字段、实现已有 apply 调用/唯一结果处理；不改变 Procure parser/result JSON，不新增 Procure catalog 或发布。先验收合成未登记卡片/隔离fixture，不把此批准解释成产品可自动安装许可。

以上都是使实现符合既有协议的候选修复；由于当前实现冲突且包含受保护字段/跨应用行为，按 AGENTS 仍须先报告并取得有限批准。单纯恢复开发、commit/push 或已批准 P1 均不涵盖它们。若用户偏好更改协议以迁就旧实现，必须另列准确字段/调用者兼容影响并先协调上游；本文件不建议这种扩项。

## 当前可独立推进的验证

可在无生产、无网络副作用的静态/合成测试中固定：精确 launch 参数集、缺失 digest 失败闭合、检查更新不启动/下载/安装、apply 唯一 operation/result 对应及旧结果拒绝。此类测试能证明解析和调用边界，不替代 Toolbox UI、真实 stable Release API 或双入口联合E2E。当前未新增验证脚本、未运行 Cargo、未改 Runner/Manifest/URL；本轮只有审查文档。

完成联合验收必须固定两个仓库 SHA、安装包 digest、OS、各调用参数、网络失败和结果文件证据；保留父发布/业务/安全门禁。现阶段这些项目为 BLOCKER（联合接入），而非已接受或已实施。

上游依据：[统一标准](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/HONSEN_WINDOWS_APPLICATION_STANDARD.md)、[更新协议](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/honsen-desktop-update-protocol.md)、[接入契约](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/toolbox-integration-contract.md)、[Toolbox 实际调用代码](https://github.com/etianwang/Honsen-toolbox/blob/main/MainWindow.xaml.cs)。
