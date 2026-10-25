# 新电脑开发环境与恢复

交接日期：2026-10-25。先读 [交接总览](HANDOVER-2026-10-25.md)。本说明的应用基线是 f4756afdb01ebac7b17ae9016d9ad56ab450fea5，交接文档分支是 codex/handover-docs-20261025；二者不能混为同一应用提交。

## 先恢复源码

在新电脑自己选择的空目录执行，不能复制旧 worktree 的 .git 指针或假定 E 盘存在：

```sh
git clone --branch codex/handover-docs-20261025 https://github.com/etianwang/Honsen-procure.git Honsen-procure
cd Honsen-procure
git fetch origin
git switch --detach f4756afdb01ebac7b17ae9016d9ad56ab450fea5
git rev-parse HEAD
node --version
npm ci
npm run typecheck
npm run test --workspace @honsen/shared
npm run test --workspace @honsen/desktop
```

.nvmrc 固定 Node.js **24.18.0**。用 npm ci 和提交的 package-lock.json；不重生成锁文件。恢复后按任务另建 codex/ 分支，不在 main 开发。若需后续已推送身份栏修复，显式选择 0fd4a99674496ead51ac7e12186c31dbcd2d57e8 并记录差异；它没有替代冻结安装器。

## Windows

- 安装 Git for Windows、Node.js 24.18.0 与 npm、Rust MSVC 工具链和 Cargo。Rust 版本以 rust-toolchain 文件（若所选分支存在）及实际 rustc -V / cargo -V 为准，本次未新增工具链锁定文件。
- 安装 Visual Studio C++ Build Tools，包含 C++ 桌面开发与 Windows SDK；使用 x64 MSVC 开发环境。
- 安装/确认 Microsoft Edge WebView2 Runtime；Tauri 2 前端依赖由 npm ci 恢复。
- 安装 Codex 并重新登录 GitHub；在新仓库读 AGENTS.md，再读交接文档。原电脑聊天不作为唯一上下文。
- Windows 安装包使用项目现有 Tauri/NSIS 工具链；按 [构建脚本](https://github.com/etianwang/Honsen-procure/blob/f4756afdb01ebac7b17ae9016d9ad56ab450fea5/scripts/build-windows-release.mjs) 检查实际环境变量与安装工具。不要直接运行旧机器绝对路径。
- PostgreSQL 16 隔离测试使用 WSL2 Ubuntu 内的 Docker Engine、Compose Plugin、Buildx；不用 Docker Desktop。使用正常开发用户，不擅改 WSL 默认用户或 Docker 组。先检查 docker version、docker compose version、docker buildx version。

Windows NSIS 安装、Credential Manager、注册表、UAC、Runner 和 Toolbox 原生更新验收必须在真实 Windows 环境进行。当前冻结安装器已有 P1，不能当成可投入生产的安装器。

## macOS

- 安装 Git、Node.js 24.18.0/npm、Rust 与 Xcode Command Line Tools；检查 git --version、node --version、rustc -V、cargo -V、xcode-select -p。
- 安装 Codex 并重新登录 GitHub。PostgreSQL 16 隔离测试使用 Colima 与对应 Docker context，并检查 docker、compose、buildx；不要指向生产数据库。
- 可继续 React、TypeScript、Node.js API、PostgreSQL、共享包开发；Rust 在审查 Windows 条件编译、凭据后端和原生依赖后再运行。跨平台 Rust 编译/测试本次没有实测。
- macOS 的测试不能替代 Windows 安装器、凭据库、注册表、UAC 或 Toolbox 验收。暂不承诺已有 macOS 安装包或完整原生运行支持。

## PostgreSQL 隔离测试（解除冻结并选择相应任务后）

复制 .env.test.example 为本机不跟踪的 .env.test，仅填写一次性测试配置。禁止使用 .env 或生产凭据。容器为 PostgreSQL 16、只绑定 127.0.0.1:54329、无持久卷。

```sh
docker compose --env-file .env.test -f compose.test.yaml up -d --wait
```

在测试进程安全设置 TEST_DATABASE_URL 为该一次性容器的地址，再执行 npm run test；有 TEST_DATABASE_URL 时它已包括 PostgreSQL suites，不追加重复的 test:postgres。本次迁移封存不启动数据库。完成后按仓库测试规程处置一次性容器；当前用户未授权本轮删除任何资源。

## 其他定向质量门禁

根目录：npm run format:check、npm run lint、npm run typecheck、npm run test、npm run build；按 UI 范围运行 npx playwright install chromium 与 npm run e2e -- tests/e2e/指定文件。Rust：在 apps/desktop/src-tauri 运行 cargo fmt --check、cargo check、cargo test。实际 native 参数先读 tests/native 对应脚本；不可向业务 profile 或生产服务运行测试。

构建变量（只列名称）：HONSEN_RELEASE_VERSION、HONSEN_UPDATE_MANIFEST_URL、HONSEN_RELEASE_TARGET_DIR；桌面运行配置 HONSEN_SYNC_API_BASE_URL。脚本中可能仍有 E 盘默认值，必须显式设置当前 OS 的有效路径。普通恢复测试不需要 COS 或 PostgreSQL 秘密。

## Linux 手动部署入口

[中文手册](https://github.com/etianwang/Honsen-procure/blob/f4756afdb01ebac7b17ae9016d9ad56ab450fea5/deploy/linux/README.zh-CN.md)、[受控部署说明](https://github.com/etianwang/Honsen-procure/blob/f4756afdb01ebac7b17ae9016d9ad56ab450fea5/deploy/linux/README.md)、[COS 模板](https://github.com/etianwang/Honsen-procure/blob/f4756afdb01ebac7b17ae9016d9ad56ab450fea5/deploy/linux/.env.production.example)、[权限策略](https://github.com/etianwang/Honsen-procure/blob/f4756afdb01ebac7b17ae9016d9ad56ab450fea5/deploy/linux/api-grant-policy.json)。使用固定 RC 内的文件，不把历史 release WIP 的 www 服务配置覆盖回来。已验实现使用专用 honsen-procure 用户、受保护代码目录与 /etc/honsen-procure/server.env；宝塔 /www 拓扑仍需单独审查、授权与实测，不能直接把运行用户改成可写代码的 www。PostgreSQL 由宝塔独立管理，不移动数据目录。本轮不部署。

## Windows/Toolbox 发布恢复入口

[接入合同记录](https://github.com/etianwang/Honsen-procure/blob/f4756afdb01ebac7b17ae9016d9ad56ab450fea5/docs/HONSEN_TOOLBOX_INTEGRATION.md)，以及 [最新安装缺陷/批准边界](https://github.com/etianwang/Honsen-procure/blob/7ef0284272f3857977a79ec7c24c70ffdc530d91/docs/reviews/RC-STABILIZATION-TOOLBOX-APPROVAL-20261025.md)。冻结解除后先取得其中有限合同修复批准，再修复和测试 NSIS 目录初始化与 Runner 适配；固定新 SHA 后构建、逐文件计算 SHA256，在 Windows 完成安装/升级/失败恢复/卸载保留数据与 Toolbox 联测。只有另获正式发布授权才发布 stable Release；本次交接 Draft 不能作为更新源。

## 继续开发进度的具体操作

1. 用上面的交接分支clone后，先打开docs/HANDOVER-2026-10-25.md及HONSEN-V1-HANDOVER/BRANCH-STATUS.md，不依赖旧电脑目录或聊天。交接分支仅提供文档；应用开发恢复到选定的RC或Agent分支。
2. 要接手付款，另建空目录clone --branch codex/procurement-t09a，核对a869a526；接手业务用codex/v1-business-flow并核对a2b73ae9；安装缺陷先读7ef0284的批准方案。先fetch核对实际远端变化，不把日期快照当永久最新。
3. 要恢复未提交工作，另建目录clone并checkout BRANCH-STATUS对应的codex/handover-20261025/wip-ID。源文件已经在GitHub，无须把整个旧worktree拷回来。wip-10含冲突现场，wip-41为旧未提交合并；二者不能当可运行基线。完整patch/index/合并记录在压缩包worktree-snapshots中。
4. 读选定分支memory.md、docs/BUILD-TASKS.md、docs/ROADMAP.md及任务验收，再装依赖并运行受影响检查。复制HANDOVER总览末尾的新Codex Prompt建立新会话；用户明确解除freeze后，只选一个最小子任务继续。
5. 如需敏感配置，先保存并验证PRIVATE-RECOVERY说明中的密文/密钥，再离线解密到私人空目录；不要把解密ZIP或.env放入仓库。恢复业务SQLite必须另按原备份/安装UUID规范审查，不能直接覆盖新数据库。

用户最终选择：微信保存精简恢复包，不携带截图/安装器/API包/缓存；大型资产存GitHub专用Draft备份。敏感包与密钥分开保存，按PRIVATE-RECOVERY恢复。
