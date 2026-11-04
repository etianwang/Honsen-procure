# Toolbox launch scope2 精确实施方案 — 2026-11-04

状态：**待用户批准，未修改 production 代码**。本方案只批准 Procure 自身 Runner launch；scope3 Toolbox 跨仓库 caller 不在本次范围。

## 已确认差距

当前 `src/update_runner.rs::launch` 只读登记和 Manifest，核对部分身份/主 EXE 路径后 spawn；未读取 canonical stable、提示三选项或保存跳过版本。它也没有在 spawn 前完成 schema/publisher/完整路径/版本一致性检查。`Registration` 私有读取缺 LauncherPath 和两个更新源值，read_registration 当前取第一个匹配登记。scope1 的 Node helper只用于构建/只读检查；Runner 分发不带 Node，不能从 Runner 调用该脚本假装实现运行时更新。

## 精确文件边界

- `apps/desktop/src-tauri/src/update_runner.rs`：launch 编排；提取私有 validate_installed_identity / launch_verified_local；扩充私有登记读取并核验所有已有字段；复用 read_manifest、verify_file_version、verify_installer_sha256。apply 的公有参数/OperationResult字段与行为不改。
- 新私有 Rust模块 `src/update_launch.rs`：strict stable解析、数值版本比较、选择状态机、skip偏好文件、HTTPS元数据/下载；在lib.rs仅导出给Runner内部使用。
- 新 `src/update_launch_windows.rs`：WinHTTP获取和原生Unicode对话框/按钮事件，仅cfg(windows)。
- `Cargo.toml`：只为现有windows-sys增加 Win32_Networking_WinHttp、Win32_UI_WindowsAndMessaging 等实际需要的feature，不加Node、WebView、外部脚本引擎或后台服务。Cargo.lock仅在feature解析确需更新时改，禁止顺带升级依赖。
- `src/bin/honsen_update_runner.rs`：只把launch错误显示成原生简短信息并保持既有退出码；立即更新调用**当前已安装Runner原有apply命令入口**，不得直接调用apply函数跳过临时副本worker流程。parse_launch不增加参数。
- 相关Rust/CLI回归、独立Windows launch验收脚本、现有integration/review记录。NSIS、Manifest schema/字段、应用身份、旧登记、安装默认路径、API/SQLite/业务同步不改。

## 本地身份先验：任何联网、选择或spawn前必须通过

1. 精确appId=honsen.procure，HKLM/HKCU及32/64位视图枚举；同一有效实例可去重，冲突实例fail-closed，不自动修复/迁移。
2. InstallLocation绝对真实目录；ExecutablePath、LauncherPath、UpdateRunnerPath对应固定文件且全部处于同一目录。检查真实canonical文件路径和reparse/symlink逃逸，不能只做字符串前缀比较。
3. Manifest schemaVersion1、publisher Honsen、固定appId/EXE/Runner名称；登记主程序/Launcher/Runner与Manifest一致。登记及Manifest版本合法且相等，实际主EXE的Windows文件版本匹配，当前Runner自身路径也属于该登记。
4. Manifest URL与两个登记URL全部为已批准canonical releases/latest地址。旧自定义URL登记拒绝并给出人工接续原因，不自动改写旧登记。
5. 任何上述身份失败都禁止启动、下载和更新。再次真正spawn本地主程序前重新核验，不能把源失败兜底用于绕过身份检查。

## 原生UI和安全网络

使用Windows USER32 `DialogBoxIndirectParamW` 的内存Unicode DLGTEMPLATE和标准BUTTON/STATIC控件：**立即更新／稍后提醒／跳过此版本**，默认焦点“稍后提醒”，Esc/关闭等于“稍后提醒”。三语固定文案可按Windows UI语言选择，未知语言中文回退；不读业务SQLite。支持键盘、Tab/Enter/Esc、UIA及高DPI/长版本文字检查。此API支持内存模板和原生按钮，不需要浏览器、Node或修改UAC/Comctl32 v6应用Manifest。参考 [Microsoft DialogBoxIndirectParamW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-dialogboxindirectparamw) 和 [Dialog Boxes](https://learn.microsoft.com/en-us/windows/win32/dlgbox/about-dialog-boxes)。实现须保证模板DWORD对齐及回调生命周期，Rust unsafe封装保持最小。

WinHTTP采用系统受支持代理和TLS证书验证，不设置忽略证书/主机名标志、不降级HTTP。metadata请求canonical API，15秒总预算，拒绝redirect/超大或畸形响应。严格移植现scope1 stable解析规则：非draft/prerelease，合法v版本，唯一且精确版本匹配Setup.exe，确切同仓库HTTPS下载URL，GitHub sha256 digest。版本逐段整数比较，禁止字符串排序/降级。

资产下载仅在用户点“立即更新”后发生。保持HTTPS并逐跳限制GitHub可信资产重定向目标、有限次数/超时及长度上限；下载至本用户独立UUID临时目录，create_new防覆盖，完整下载后核SHA-256，再传既有apply。网络返回值不能决定本地安装目录/EXE/参数文本；不经shell拼命令。不会为了试验发布Release或启用catalog。

## 三项选择与待批准的失败/离线政策

| 情况                                                       | 提议精确行为                                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stable无新版本                                             | 重新核验后启动已登记本地EXE，不下载                                                                                                                                         |
| 立即更新                                                   | 只下载选定已验证资产；校验后调用既有apply，wait-pid0（launch尚未启动client）、restart=true、当前source原样记录、UUID operation/result路径；读取其专属result，不新增协议字段 |
| 稍后提醒／关闭选择框                                       | 不保存skip、不下载；重新核验后启动本地EXE，下次launch仍检查                                                                                                                 |
| 跳过此版本                                                 | 原子保存仅该exact stable版本，再核验启动本地EXE；未来更高版本仍提示，不得成为永久禁用更新                                                                                   |
| 离线、DNS/TLS/超时、404、限流、源5xx、畸形或不可信metadata | **显示明确更新检查失败警告；用户确认“继续启动本地版本”才重新核验启动。可取消退出；绝不把失败说成已最新。** 无下载/更新，不自动无声启动                                      |
| download或hash失败                                         | 删除本轮不完整下载、显示错误，不调用apply；只允许用户明确另选“启动当前本地版本”，且重新核验；不写skip                                                                       |
| apply失败/UAC取消/postinstall验证失败                      | 使用原result/log展示失败；不自动重启、不自动回滚、不把失败兜底当成功；若需启动本地必须另次launch通过全部当前身份检查                                                        |
| 原生对话框创建失败                                         | launch失败退出；不擅自默认更新/跳过/静默spawn                                                                                                                               |

**用户须明确批准上述离线/404/源失败时“警告+用户确认后允许启动已验证本地版本”的政策，才开始编码。** 这保留离线业务能力，同时不能绕过身份/完整性校验。当前正式stable真实404属于此策略覆盖的失败，而不是伪造可用版本。

偏好位置固定为已有标准 `%LOCALAPPDATA%\Honsen Program\UpdatePreferences\honsen.procure.json`，私有最小字段如schemaVersion=1/skippedVersion；只存版本，不存token/URL/业务数据。坏JSON/旧版本/权限失败不当成“永久skip”，展示必要提示后按默认检查；原子写、拒绝symlink/reparse逃逸。无需更改Manifest或公开Result JSON。文件具体最小格式作为本次私有实现一并批准，不跨产品推广。

## 必须执行的针对性验证

- Rust状态机：无更新/数字版本/skip下一版本、draft/prerelease/缺digest/多个installer/外仓URL拒绝、所有失败分支无下载或无apply；偏好失败与原子写。
- 身份negative：冲突登记、旧URL、主EXE文件版本不符、Launcher路径不符、symlink/reparse逃逸等均不联网、不spawn；最小有效本地实例可启动。
- Win32原生真实按钮：三按钮及Esc/关闭、键盘/UIA、高DPI、中文/法文/英文、离线警告确认/取消。不得用DOM fixture代替Runner原生UI。
- 可注入Rust测试transport证明网络失败策略，但测试endpoint/可信CA例外不得进入生产Release；正式canonical URL不改。安装Sandbox实际source失败（目前404）分支验证。
- 独立Windows安装候选：准确SHA/Setup和EXE hash；正常launch、失败取消、skip保存重启、立即更新复用apply原有校验/临时副本结果；升级后同目录和合成数据保留。对现有apply拒绝与P1仅补受影响边界，不重做整个目录矩阵。
- 真实canonical稳定资产当前缺失时，记录立即更新真实线上路径BLOCKED_ENV；不以mock、单元测试或创建正式Release替代最终资产验收。

## 明确不包含scope3

Toolbox当前launch多传参数/缺第三方apply调用，仍由另一个精确方案和批准处理。本轮不改Toolbox repo、不新增catalog、不使Procure成为可自动安装产品。本地只读观察H:/Honsen直接目录未发现Toolbox源码目录；不据此宣称整台电脑绝对不存在，也不猜路径或擅自clone修改。

交付前继续读取五个上游来源并复核本方案与现integration。此文档不是实施完成、用户授权已获得或门禁PASS的证明。
