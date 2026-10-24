# Honsen Procure V1 Linux 候选部署手册

本包面向 Ubuntu 24.04、Node.js 24.18.0、宝塔独立管理的 PostgreSQL 16 和宝塔 Nginx。它是待验收 RC，不授权生产部署。桌面只连接 HTTPS API；不改动 PGDATA。

## 目录、用户和密钥

统一应用根目录 `/www/Honsen-procure`，版本目录为 `releases/<SHA>`，`current` 由部署控制器切换。服务仍使用独立非登录用户 `honsen-procure`。root 拥有发布文件和所有父目录且禁止其他用户写入；服务用户只读代码。不得因宝塔默认 www 账户而放宽受保护目录检查。如果 `/www` 不是 root 所有或组/其他用户可写，应先由主机管理员评估并安排受保护的实际目录；不要直接递归修改现有站点权限。

密钥仅放 `/etc/honsen-procure/server.env`，root:honsen-procure 0640；部署配置、数据库服务/密码文件、审计和备份由 root 保护，位于公开站点外。应用业务数据和日志使用独立目录，不能写安装/发布目录。PostgreSQL 不开放到公网，不把数据库/COS 密钥放入前端、Git、压缩包或 Nginx 日志。

## 构建和核验候选

在 Linux 受保护、root 所有的构建目录内，从确定提交运行：

```bash
RELEASE_DIR=/var/lib/honsen-build/candidate npm_config_cache=/var/cache/honsen-npm bash deploy/linux/scripts/build-release.sh
```

构建要求干净的 tracked Git 源码、Node.js 24.18.0，保留 committed lockfile。输出完整独立 Git 快照、API dist、运行依赖、共享契约、全部 PostgreSQL/SQLite 迁移、完整 deploy/linux 控制器、模板、测试和许可证；另外输出 `.tar.gz`、`.sha256` 和外部 `.manifest.json`。SHA 是源码提交，文件 SHA-256 是产物完整性。通过独立可信渠道传递 manifest digest，不能仅信任同一下载目录内的哈希。

解压到 root 所有且不可被服务用户修改的 `releases/<SHA>`。保留包内 `.git` 用于源码身份验证。先核对压缩包 SHA-256，再运行 `verify-artifact.cjs` 核对独立 manifest 和完整文件清单。不得直接改包内模板；实际配置放受保护目录。

## 数据库与 COS

使用专用部署管理员、旧运行角色和新运行角色；禁止 API 使用超级用户或 migration owner。`postgres/create-role.sql` 只是角色创建示例，密码在操作机安全输入。不要运行历史 blanket grants；`postgres/grant-runtime.sql` 已明确失败退出。

复制 `deploy.env.example` 至 `/etc/honsen-procure/deploy.env`，root:root 0600。逐项填写数据库直接连接、同一主库 libpq 配置、角色、候选 SHA、独立 manifest digest、writer inventory、异地备份和独立恢复集群。保持 `DEPLOY_AUTHORIZED=no`，直到实际部署人完成检查并明确授权。

运行环境参考 `.env.production.example`。COS 使用私有 Bucket，配置 `COS_REGION`、`COS_BUCKET`、`COS_SECRET_ID`、`COS_SECRET_KEY`，可选 TTL。四项全空禁用附件归档，部分配置必须拒绝启动；占位符不能用于上线。临时凭据仅授予特定对象 Put/Get/Head，不公开 Bucket。详见 [付款/COS 交接](../../docs/T09-T11-RELEASE-HANDOFF.md)。

迁移身份是完整文件名，不能只按数字前缀去重。包含 PostgreSQL `005_procurement_expenditures.sql`、`006_attachments.sql`、`011_attachment_derivation.sql`、`012_payment_sync_compatibility.sql` 及其他全部迁移。SQLite 0032/0033/0034 和 0056/0057/0058 由新版桌面执行，绝不能送入 PostgreSQL。

## systemd、宝塔 HTTPS 与受控部署

安装包内 `deploy/linux/honsen-procure.service` 到 systemd，保留其 readiness 条件、专用用户和停止策略；实际 Node.js 24 必须在服务 PATH 中。不要同时启用 PM2。宝塔站点使用 `nginx/honsen-procure.conf`，替换域名和证书路径后执行 `nginx -t`；保持 API 仅监听 127.0.0.1:3000，公网 HTTP 重定向 HTTPS。首次部署前将包内 `nginx/ingress-maintenance.conf` 以 root:root 0600 安装为 `/etc/honsen-procure/nginx-ingress.conf`，保持初始 503；站点 location 必须且只能 include 此专用文件一次，不能绕过控制器直接 proxy_pass。按主机实际设置 `NGINX_BIN`、`NGINX_UNIT` 和 ingress include。

完整部署流程由现有控制器执行，而不是手工跳过某一步：停写和入口维护、独占部署锁、私有本地及已确认异地备份、独立集群恢复校验、对象快照、migration、`grant-api.cjs`、新角色验证、启动和 HTTPS readiness，最后恢复流量。控制器要求旧/新角色轮换和 writer inventory；首部署若无法满足这些条件，应保留阻断并安排 staging，不得伪造旧角色或移除门禁。

实际部署人获批并完成全部配置后，才可执行：

```bash
sudo bash /www/Honsen-procure/releases/<SHA>/deploy/linux/deploy.sh --execute /etc/honsen-procure/deploy.env
```

该命令不是本 RC 集成的授权内容。先在隔离 staging 演练，确认受限角色读写、未知对象/权限不足拒绝、国家隔离、付款冲销、COS、API/HTTPS 启动。

## 备份、恢复和失败处置

使用控制器调用的 `deploy/linux/backup.sh`、`verify-external-backup.sh`、`verify-restore.sh`，保留 retain-all、offsite attestation 和独立集群校验。不要用轻量备份脚本替代发布门禁。日常保留策略需要部署人批准，不能自动删除最后可用副本。

部署失败后入口保持维护，API 和新角色保持关闭；保留持久部署锁及审计。按 [完整控制器说明](README.md) 核对失败阶段后再决定恢复。恢复业务库是破坏性操作，必须另获明确授权、先停写并保存当前数据库。`scripts/restore.sh` 要求显式确认并创建恢复前备份；它不是自动回滚。不得删除付款/附件新表来降级，也不得仅切换旧二进制后假定数据库兼容。

## 尚未满足的正式上线条件

统一安装包的真实 Windows/Toolbox 更新及数据保留、双客户端付款/冲销/COS、核心采购闭环和独立备份恢复验收须有对应 SHA 的证据。Credential Manager 失败必须保留为环境阻断。生产域名、宝塔实际拓扑、异地备份、角色和部署授权由用户最终确认。
