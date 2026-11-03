# Codex 环境恢复状态

核验日期：2026-11-04（Asia/Shanghai）。CODEX_ENV_BLOCKED；HANDOVER_FREEZE 保持。

## 已实测

- Codex CLI 0.166.0-alpha.5.1；桌面版本26.1027.51404。codex doctor：config loaded、auth configured、desktop app-server initialized；19 ok / 0 fail，但 degraded。
- 真实主 Agent + 三个并行子 Agent：payment_cos、procurement、release_deploy，均执行只读工具并返回结果；不是角色模拟。本会话四个并发槽位。角色尚未持久化为新会话自定义配置。
- 官方 openai-docs Skill 已发现并读取；documents/pdf/spreadsheets 等既有官方 Skills 可发现，未重复安装。Rust、React、SQL、Git 等优先使用已有工具；旧电脑专用 Skill 清单无备份证据。
- MCP node_repl 最小调用返回 PASS 和正确项目目录。GitHub 集成认证用户 etianwang；实际读取 PR20/PR19 与 CI run40108807323，历史 conclusion success，不代表当前分支CI。
- git fetch origin main 成功；读取远端交接分支 NEW-COMPUTER-SETUP、COORDINATION-SUPPLEMENT。没有恢复或复制旧明文令牌。
- Windows系统Node26.13.0；项目缓存Node24.18.0重新实测成功，PATH仅在检查进程调整。共享包Vitest 5文件16测试通过。
- Rust/Cargo1.99.1。WSL Ubuntu24.04/WSL2默认root；未改默认用户或Docker组。
- Docker安装结束后复测：Compose5.7.0、Buildx0.38.1；systemctl start docker成功，Server29.9.2。

## 自动化与边界

复用 npm format:check/lint/typecheck/test/build/e2e/test:postgres。已执行一次非破坏性共享包测试。主会话可以调度、汇总真实子Agent和读取PR/CI；Git检查点和恢复依赖任务记录。未设置周期任务，未承诺会话关闭后继续运行。未推送、建PR、合并、发布或接触生产数据库。

RC脚本位于交接应用基线f4756af，当前origin/main较早且没有该脚本；未把交接分支文档当作完整应用基线，未拼接发布逻辑。正式RC构建继续受freeze和Toolbox批准边界约束。

## 未通过及下一步

- BLOCKER：尚未持久化三个自定义Agent及完成新会话加载实测；旧Codex配置备份未找到，不虚构恢复。
- BLOCKER：doctor提示可选MCP环境变量缺失、Responses WebSocket超时；当前HTTPS及node_repl/GitHub实测正常，需继续定位具体服务器。未修改全局配置，故无需配置回滚。
- BLOCKER：隔离PostgreSQL、浏览器最小测试、完整依赖安装结果、普通WSL开发用户及跨环境全门禁尚未验收；缺失证据影响最终环境READY，不能用共享测试替代。
- DEFERRED：解除freeze后从明确应用SHA恢复RC构建和付款/COS原生验收，禁止在旧main树声称完成。
- WARNING：本次无需重新授权GitHub；COS、部署服务和旧机秘密未验证，按需通过官方或安全本机方式授权。

## Git与交接

原工作树codex/wsl2-environment-recovery的既有docs/WINDOWS11-DEV-ENV-STATUS.md、memory.md和.cache均保留，未纳入本任务。独立工作树H:/Honsen/Honsen-Procure-codex-env，任务分支codex/codex-env-recovery-20261104，基于已fetch的origin/main 5139cc8。仅新增环境状态及handoff，不改业务/Schema/迁移/Toolbox合同。没有正式发布或数据更改。

## FINALIZATION — 2026-11-04

持久配置按当前官方 Subagents 文档写入项目 .codex/config.toml 与 .codex/agents/*.toml：orchestrator、payment_cos、procurement、release_deploy；继承模型，无自造model字段。每角色保留 AGENTS/HANDOVER_FREEZE 与主控分配边界。配置来源：https://learn.chatgpt.com/docs/agent-configuration/subagents 。主会话职责由任务提示明确，角色文件不会自动替换主会话。

新 CLI 只读会话01a1a371-4646-7202-866b-bd2884c04aa3已实际加载并调度三个角色，GitHub PR20与CI run40195470167查询成功；Node REPL/浏览器实际调用失败，返回sandbox provisioning orchestrator_helper_incomplete，重试另报kernel.js MODULE_NOT_FOUND。没有为绕过失败关闭只读隔离或Windows保护。

具体doctor警告：mcp.config仅node_repl可选环境变量CODEX_WINDOWS_REGISTERED_CORE未设置；另有Responses WebSocket超时、非DevDrive、TERM=dumb及endpoint exclusion未验证，未擅改安全策略。显式沿用用户代理后CLI推理可用，已有官方Skills可发现；图标路径警告与PowerShell shell snapshot不支持属于独立警告，不扩大安装。

桌面全新只读验证chat：01a1a373-03c2-7ea1-b06f-cb89d7e6e94a，在主目录本地运行，无新worktree；等待其最终工具证据后更新状态。当前主会话已实际执行Node REPL与Computer Use；三个真实子Agent已返回只读检查结果。

目录收敛保留：本报告从Honsen-Procure-codex-env未提交文件复制至主目录；源worktree及其memory增量未删除或改写。未找到旧专用Skills备份，未虚构恢复；现有官方组件复用。

## 最终状态：CODEX_ENV_READY（桌面开发会话）

桌面全新只读chat01a1a373-03c2-7ea1-b06f-cb89d7e6e94a最终完成：

- 重新读取orchestrator、payment_cos、procurement、release_deploy四份持久角色文件；主控真实调度三个对应子Agent，均收到返回。
- payment_cos实际通过GitHub连接器读取PR20（open/draft/未合并）。该子Agent的combined status仅返回空statuses，不能据此声称Actions通过；当前主会话另实际查询run40195470167及quality job为success，属于历史SHA证据，不代表本任务分支CI。
- procurement实际执行Node REPL nodeRepl.write(1+1)，结果2，无错误。
- release_deploy读取相关Skill后，通过浏览器工具成功打开about:blank，返回Tab1与对应AXWebArea。
- 该会话没有写文件、建worktree、安装或读取秘密。配置在新会话重载后仍能发现，满足桌面持久化验收。

WARNING：独立CLI read-only启动的Node REPL/浏览器仍会出现sandbox helper/kernel错误；桌面新会话已证实无此故障。这属于CLI专用路径的已知限制，不声称CLI也READY；未来若需要独立CLI无人值守，应先修复该运行时，不能关闭隔离绕过。官方Skills与MCP按现有可信组件恢复，无额外不明安装。

交付检查：Markdown Prettier check和git diff --check通过；codex --strict-config新会话实际加载配置成功。单独对TOML调用Prettier因无parser失败，改以当前Codex真实加载验收；没有为此安装parser。尝试python TOML解析被Windows应用别名拦截，未因此扩展安装；不影响已完成的真实配置加载证据。无业务改动，未重复全套测试。
