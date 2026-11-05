# API 单活动版本与回退交付约束

用户确认日期：2026-11-06。本文件记录已批准目标，不代表实现、部署或回退验收通过。

## 固定运行边界

- 同一公司同一时刻仅运行一个 Node.js API；宝塔 Node 项目管理器只启动活动版本。
- V1 API Base URL：`https://api-pr.honsen.africa/v1`；目录：`/www/wwwroot/api-pr/v1/`。
- 未来 V2 API Base URL：`https://api-pr.honsen.africa/v2`；目录：`/www/wwwroot/api-pr/v2/`。
- 所有 Windows 客户端使用统一 Base URL；客户端升级后统一切换活动版本。
- `/v1`、`/v2` 是部署升级边界，不代表并行业务服务。不新增网页版管理系统或多版本编排系统。
- 本轮授权仅限本地 V1 ZIP 制作；不连接远程服务器、不部署 V2、不更改生产数据。
- 部署目标沿用 Node.js 24、PostgreSQL 16、Cloudflare Flexible 与已批准 Seed。不得据此跳过现有安全或 Seed 验收。

## 升级与安全拒绝

先备份配置和数据库，确认备份可恢复，再停止旧版本，执行项目受控迁移，启动新版本。切换后验证健康、登录、角色权限、Push/Pull、重试与冲突保留。

反向代理只转发活动版本的路径，停用路径必须明确拒绝，例如 HTTP 410 和升级提示；不得将停用的 `/v1` 重写转发至不兼容的 V2。未匹配路径不得落入业务写入入口。需通过实际代理集成测试证明停用路径请求不会触发业务处理。

## 回退

旧目录及原始 ZIP 保留，不自动删除，不覆盖 V1 原始包。回退前核对旧 API 对当前 PostgreSQL schema 的兼容性及迁移历史；无证据即不允许启动旧 API 写入数据库。

不兼容时，仅可使用经过验证的宝塔备份恢复流程，并明确恢复时间点之后数据的处理方案；恢复生产数据库仍需明确授权。复制旧文件覆盖新文件不构成回退。保留旧包只构成回退候选，不能宣称已具备可执行回退能力。

## 冻结和交付字段

服务端闭环验收后冻结源码 SHA、API 契约、数据库迁移版本、Seed 内容及 ZIP SHA-256。软件版本、活动 API 版本、数据库迁移版本必须分别记录，不得由目录名或桌面软件版本推断数据库版本。

每个交付记录必须列明：软件版本、源码 SHA、活动 API 版本、统一 Base URL、部署目录、迁移集合与版本、Seed 标识与摘要、ZIP SHA-256、验证命令与结果、数据库兼容性及恢复验证证据。

## 初次检查结果（历史：d167b7e，已被下方记录更新）

检查基线：`eeaa008`；未连接远程服务器。

- 客户端 Rust 多处从 `HONSEN_SYNC_API_BASE_URL` 读取地址，缺失时返回传输错误；尚未建立上述生产默认值及客户端升级提示验收证据。
- `deploy/linux/scripts/build-release.sh` 生成 TAR 包，面向现有 Linux 控制器；不是已验证的宝塔 Node 项目 ZIP。
- `deploy/linux/nginx/honsen-procure.conf` 当前为源站 HTTPS 示例，未实现上述固定域名的单活动路径及停用路径拒绝方案。
- 服务端包版本仍为 `0.0.0-development`，不能声称 V1 已冻结或闭环验收通过。
- 原有安全、安装和发布最终验收保持开放；本文件不关闭任何父任务。

初次检查的历史 BLOCKER（不代表当前状态）：V1 ZIP 当时尚未生成；默认地址、停用路径拒绝、宝塔运行入口与冻结清单尚需实现和相关测试。

DEFERRED：远程部署及真实恢复验证，必须另获授权；V2 开发和部署不属于本轮。

WARNING：当前旧文件保留不等于具备已验证的生产回退能力。

## 2026-11-06 实际候选交付

已实际生成 ZIP 候选；其中 `d69d9cf8bd1abf9aa73d4e61ea6a6a0e766dea89` 在独立登录验收发现失败密码返回500的缺陷，不能作为最终交付通过。最终候选以验收记录中的精确源码和摘要为准，不代表最终生产冻结或稳定发布。实际构建、摘要、宝塔命令及回退限制见 [ZIP 验收记录](reviews/SERVER-V1-ZIP-20261106.md)。客户端默认地址/明确覆盖/安全错误/路径拼接和升级停止重试已实现，保留既有SQLite及Outbox。

数据库集合为17个受控迁移文件，最新 `014_master_data_currencies.sql`；软件包版本仍为 `0.0.0-development`，活动 API 为 `v1`。不可混同这三种版本。Seed只导入已批准国家/项目/单位及运行时初始管理员，不携带无关旧供应商、报价或未核实税率。

国家税率权威依据与条件印花规则仍未完成，不能报告 `SERVER_V1_READY`。原有安全/原生/安装/Toolbox最终门禁仍开放，不由本包替代。旧包保留仅形成回退候选，没有已验证的生产数据库回退能力。

最终实际交付候选绑定源码 `ebd7d6b1ff303fd68ad3abb7eb455570d15a043f`；独立Linux解包、登录改密、业务/重启/撤权及真实代理范围已通过。最终总结果仍为 `SERVER_V1_BLOCKED`，详见 [交付汇总](reviews/SERVER-V1-DELIVERY-20261106.md)。

## 2026-11-06 tax clarification implemented

The user confirmed CI18%/CM19.25% and manual stamp duty. The earlier missing-tax configuration blocker is resolved for this approved operational setting; see [updated tax delivery](reviews/SERVER-V1-TAX-DELIVERY-20261106.md). Latest independently tested server ZIP pins03c2c82b7a0a34cc4f360a293478e58fd529c8f3. Original release/security/native/COS gates remain separate. Rollback compatibility must cover business JSON and signed snapshots as well as PostgreSQL migrations.
