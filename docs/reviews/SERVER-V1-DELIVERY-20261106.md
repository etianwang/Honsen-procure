# V1 实际交付汇总 — 2026-11-06

结论：SERVER_V1_BLOCKED。本轮交付实际 Linux ZIP 候选，不发布稳定生产版本，不关闭原有父任务。

## 包、版本与固定边界

| 项目                          | 实际值                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| 包绑定源码 SHA                | `ebd7d6b1ff303fd68ad3abb7eb455570d15a043f`                         |
| 软件版本                      | `0.0.0-development`                                                |
| 活动 API                      | `v1`，`https://api-pr.honsen.africa/v1`                            |
| 部署目录                      | `/www/wwwroot/api-pr/v1/`                                          |
| 数据库迁移                    | 17 个受控 SQL 文件，最新 `014_master_data_currencies.sql`          |
| ZIP 大小                      | 3,493,944 字节                                                     |
| ZIP SHA-256                   | `916787ab606ae5e772c17a8e92fa62fa6a8478998c73dc9190776feb6b34b257` |
| shared 契约 JS bundle SHA-256 | `148cc967c50b70ba4cd155d9e8d4356ef9fdf09ba69446dbd3c76be759644021` |
| Seed 入口 JS SHA-256          | `6e4e13a35f0b1a684833e151ef5d1b468125923b04ed5184f7c4a18a3c82a232` |

实际 ZIP：`H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-ebd7d6b1ff303fd68ad3abb7eb455570d15a043f.zip`。同目录保留完整 ZIP `.sha256` 文件及历史候选，未覆盖旧包。包内 SHA256SUMS 和 Manifest 固定迁移/Seed/内容。此为候选固定证据，不是服务端全部闭环后的正式冻结。

## 实施及验证

- 客户端统一默认 URL，明确配置优先，非法明确值安全失败；保留 `/api` 业务契约且不重复 `/v1`。登录、权限、同步、附件控制路由均复用该配置；COS 签名对象 URL 保持独立。没有 SQLite schema 或数据改写。
- API 410/426 映射升级提示，停止自动重试并保留 Outbox/冲突。真实 Nginx 单活动路径测试证明停用业务 POST 返回410，三个持久表计数不变；只启动一个 API，不实现 V2。
- Seed 原子创建 admin 超管、CI/CM、Bethel2办公楼/Kerene别墅/Minrex数据中心、项目 XOF/XAF、14规范单位和0站点；19条主数据同步投影与账户一起提交。初始密码仅运行时输入，不打包。重复不重置密码，失败全回滚。
- 改密接口要求有效 session 和当前密码，保留新密码12字符策略，原子写哈希/审计并撤销会话；初始 admin 只提示、不强制改密。并发错误密码不能绕过五次锁定。
- 014迁移修复既有主数据 XAF CHECK 不一致，保留旧行/快照；旧 CHECK 升级、XAF及非法币种回归通过。首次空库使用明确逐表运行角色授权；实际非owner角色拒绝DDL并通过认证/同步/改密。

客户端定向 Rust 默认/覆盖/路径/非法配置/410/426与附件控制响应测试通过；最终 Rust library 150 PASS、7项原生交互/真实网络探针忽略，未伪装为本轮安装验收。Desktop typecheck/lint/unit29/build PASS，原有effect/chunk警告保留；Playwright `api-upgrade.spec.ts` 2/2 PASS，覆盖升级提示中英切换和建议改密后仍可进入工作台，console errors为0。首次 DOM 页面导航超时保留，后续采用明确导航等待重验通过。额外 `cargo clippy --lib -- -D warnings` 未通过既有lint项，不计PASS；修正此次借用项后未扩散重构其他lint。

Shared typecheck/lint/test26/build PASS。Server strict typecheck/lint/build PASS。最终完整server测试在 `6fbd4e20217d6423152e5881e0b645d83261bd34` 为205 PASS、3 live COS SKIP，全部 PostgreSQL 套件实际执行。跳过因缺少真实COS专用授权配置，影响真实对象上传/读取/归档验收，不能由模块加载或模拟替代。与包源码比较，唯一server/shared/deploy差异是PR17测试夹具显式函数授权；生产代码、迁移、依赖与包边界未变。保留此前204/1FAIL/3SKIP记录：夹具依赖已撤销的PUBLIC函数权限，修复只显式授予测试角色，未扩大生产权限。

实际构建和代理证据见 [ZIP 报告](SERVER-V1-ZIP-20261106.md)，独立真实HTTP/重启/撤销证据见 [独立验收](SERVER-V1-INDEPENDENT-20261106.md)，受限角色/Seed/迁移/密码回归见 [认证与初始化证据](V1-BOOTSTRAP-PASSWORD-20261106.md)。历史d69包实际旧密码登录500保留为FAIL；4314899显式时间类型修复后重建ebd7包，不能将失败包改写成通过。

## 宝塔启动与回退

工作目录 `/www/wwwroot/api-pr/v1/`，选择 Node.js 24.22.1，使用独立运行角色 `.env`：

```sh
node --env-file=.env apps/server/dist/index.js
```

中文 README 提供受控迁移、运行时密码 Seed、运行角色创建及授权、`/v1` 代理和 Cloudflare Flexible 配置。Linux运行依赖已包含，无生产Docker依赖。不通过SSH操作服务器，不部署V2。

旧目录/ZIP保留只构成回退候选。实际生产回退未验证：必须先核对旧API与当前schema兼容性，不兼容时需经授权执行经过验证的宝塔备份恢复；不得直接旧API写新schema或用旧文件覆盖假装回退。

## 剩余问题和进度

- BLOCKER：国家法定税率的权威配置，以及按订单适用条件计算的印花税规则未完成。当前金额契约仍仅有比例税，不能把任意固定1000XOF当成所有订单税费，也不能把缺失税率默认为已验收。已询问权威输入；未凭空导入历史Seed税率。
- BLOCKER：原有G1原生/安装/角色历史矩阵、恢复和Toolbox/稳定发布最终门禁不由本轮服务器HTTP范围关闭。
- DEFERRED：真实COS三项因缺少授权配置未执行，对象上传/读取/归档最终门禁保持开放。
- DEFERRED：用户自行上传宝塔、生产配置/数据库备份恢复验证及V2；没有远程部署授权，也没有执行。
- WARNING：软件版本仍development、Manifest接受状态未写成READY；依赖安装提示1低/1中等advisory，未擅自升级锁文件；原有Clippy/effect/chunk问题保留。

变更集中于客户端URL/停用状态及提示、server认证/Seed/014迁移、fresh运行角色授权和Linux ZIP构建/说明/验收脚本。原M0–M4/T00–T15依赖和父任务状态不变。下一安全工作为完成权威税费输入及条件规则的受控实现/回归，并完成剩余实际P0门禁后才允许SERVER_V1_READY。

最终独立包验收已实际完成：admin初始登录/建议改密/实际改密/旧密码401和旧token401、OPA/HPA/SPO/付款冲销、重放/冻结冲突、停用账号/撤角色/撤项目写拒绝、重启五条完整payload保持均PASS。C已清理本轮Compose容器/网络/卷及3000/54329/18081监听，旧ZIP和公开证据保留。主线未连接远程服务器。
