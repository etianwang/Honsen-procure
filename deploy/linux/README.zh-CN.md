# Honsen Procure Linux 手动部署包

此包面向 Ubuntu、宝塔 Nginx、Node.js 24.18.0 与 PostgreSQL 16。它只部署云 API；桌面端绝不能连接 PostgreSQL。生产部署前必须在独立 staging 环境完成本手册的构建、迁移、启动、备份和恢复演练。

## 1. 主机准备

安装 Node.js 24.18.0、PostgreSQL 16、`psql`、`pg_dump`、`pg_restore`、Nginx。PostgreSQL 16 继续由宝塔管理；Honsen Procure 的程序、附件和逻辑备份集中在一个可搬迁目录，API 以宝塔的 `www` 用户运行：

```bash
sudo install -d -o www -g www -m 0750 \
  /www/Honsen-procure/app/releases \
  /www/Honsen-procure/uploads \
  /www/Honsen-procure/logs
sudo install -d -o root -g www -m 0750 /www/Honsen-procure/config
sudo install -d -o root -g root -m 0700 /www/Honsen-procure/backups
sudo install -d -o root -g root -m 0755 /www/Honsen-procure/scripts
```

宝塔站点不得把 `/www/Honsen-procure` 配为静态 `root` 或 `alias`，只能反向代理 API。数据库必须只监听 localhost 或私网；不得向桌面端开放 5432，也不得把连接串放入前端、Git 或安装包。

## 2. 创建最小权限数据库账户

以 PostgreSQL 超级用户执行 `postgres/create-role.sql`，将两个密码从受管密码库传入 psql 变量。随后创建数据库（所有者是 migrator）：

```bash
createdb -O honsen_procure_migrator honsen_procure
```

发布后先用 `honsen_procure_migrator` 连接串运行迁移；迁移成功后执行 `postgres/grant-runtime.sql`。服务的 `/www/Honsen-procure/config/server.env` 只使用 `honsen_procure_runtime` 账户，格式参考 `.env.production.example`。

## 3. 构建发布包（staging 或受控 Linux 构建机）

```bash
export POSTGRES_URL='postgresql://honsen_procure_runtime:...@127.0.0.1:5432/honsen_procure'
deploy/linux/scripts/preflight.sh
export RELEASE_DIR=/srv/release/honsen-procure-0.0.0
deploy/linux/scripts/build-release.sh
sha256sum -c /srv/release/honsen-procure-0.0.0.tar.gz.sha256
```

构建脚本执行 `npm ci`、TypeScript 生产构建，再建立可部署压缩包。运行时保留 `tsx`，原因是共享 workspace 当前以 TypeScript 源码导出；这不是生产服务器已验证通过的替代说法，部署前必须实际启动验证。

## 4. 部署、迁移与启动

解压经 SHA-256 验证的包至版本目录，将 `current` 符号链接指向该目录，并复制环境文件。下列 `RELEASE_SHA` 必须是最终经验证提交，不可使用 T09-A 草稿或仅通过局部测试的 SHA：

```bash
sudo install -d -o www -g www -m 0750 /www/Honsen-procure/app/releases/$RELEASE_SHA
sudo tar -xzf honsen-procure-$RELEASE_SHA.tar.gz -C /www/Honsen-procure/app/releases/$RELEASE_SHA
sudo ln -sfn /www/Honsen-procure/app/releases/$RELEASE_SHA /www/Honsen-procure/app/current
sudo install -m 0640 -o root -g www .env.production.example /www/Honsen-procure/config/server.env
sudo -u www env POSTGRES_URL='postgresql://honsen_procure_migrator:...@127.0.0.1:5432/honsen_procure' \
  /www/Honsen-procure/app/current/app/node_modules/.bin/tsx /www/Honsen-procure/app/current/app/apps/server/dist/db/migrate.js
sudo -u postgres psql -d honsen_procure -f /www/Honsen-procure/app/current/postgres/grant-runtime.sql
sudo install -m 0644 honsen-procure.service /etc/systemd/system/honsen-procure.service
sudo systemctl daemon-reload
sudo systemctl enable --now honsen-procure
sudo systemctl status honsen-procure
```

将 `nginx/honsen-procure.conf` 放入宝塔站点配置，先改为实际域名，再由宝塔申请/启用 TLS。Nginx 只代理 `127.0.0.1:3000`；外部只开放 HTTPS。确认 `curl http://127.0.0.1:3000` 的服务响应和 `journalctl -u honsen-procure` 无凭据泄露后才切换流量。

## 5. 备份、恢复与回退

每日任务以 runtime 连接串运行 `scripts/backup.sh`，备份放在 `/www/Honsen-procure/backups/`；脚本校验 custom dump 后只保留最新十份。恢复前停止服务，指定 `BACKUP_FILE`，并显式设置确认值。恢复脚本会先验证输入并创建 `pre-restore` 备份，但恢复仍会替换目标数据库：

```bash
sudo systemctl stop honsen-procure
RESTORE_CONFIRMATION=I_UNDERSTAND_THIS_REPLACES_THE_DATABASE BACKUP_FILE=/www/Honsen-procure/backups/honsen-procure-...dump POSTGRES_URL='postgresql://...' scripts/restore.sh
sudo systemctl start honsen-procure
```

发布回退只允许把 `current` 指回已验证的旧版本，并在确认其数据库迁移兼容后重启服务。不要通过回退二进制撤销已应用数据库 migration；必要时从已验证备份恢复，并记录操作授权和审计。

## 6. 上线前检查

- staging：构建、迁移、启动、受限 runtime 账户读写、备份、恢复、同步和国家权限隔离均实际通过。
- production：域名/TLS、服务账号、环境文件权限、Nginx 反向代理、数据库私网边界和监控由部署人逐项确认。
- 支付写入与冲销在其专门验证完成前保持禁用；本部署包不启用或绕过该限制。

## 7. 付款与 COS 候选版本接入（仅最终 SHA）

应用代码检查点仍为 `0595eec41edc8b068bc5d3aa687b594c60bcdf7a`；迁移授权 gate 检查点为 `9019b376c6b5eb725d02298461846077bc18b959`。两者仅用于选择候选构建输入，均不是生产部署批准。`9019b376` 的授权 gate 已通过本地受限角色、独立复核和 hosted CI，但现有部署 readiness 验证脚本尚未适配附件列级 UPDATE 与 `canonical_procurement_payment` 的受限 EXECUTE 检查，最终 CI 仍待该最小兼容修复。最终发布包必须包含 `deploy/linux/api-grant-policy.json`、grant checker 及其受审函数签名哈希/调用者检查。未知对象仍 fail-closed，不得跳过检查。真实双 Windows 客户端链路也因 Windows CredentialStore 无法创建凭据而处于 `BLOCKED_ENV`，付款、冲销、离线重启和跨端附件阶段均未执行。最终部署必须另附最终 SHA、CI 结论和独立验收；在此之前不得部署候选，也不得开放付款写入或冲销。

最终候选必须包含服务器迁移 `005_procurement_expenditures.sql`、`006_attachments.sql`、`011_attachment_derivation.sql`、`012_payment_sync_compatibility.sql`，并按**完整文件名**由 `schema_migrations` 事务/校验和日志跟踪；不得只按数字前缀识别，亦不得改写基线已有的其他 `005`/`006` 文件。桌面端必须保留 SQLite `0032_procurement_expenditures.sql`、`0033_expenditure_immutability.sql`、`0034_attachment_transfers.sql`、基线 RFQ `0032_rfq_display_numbers` 和付款 `0045_procurement_expenditures`，以及 `0056_expenditure_branch_compat.sql`、`0057_attachment_derivation.sql`、`0058_payment_sync_metadata.sql`。SQLite 迁移只由可信桌面应用在本地执行，绝不能对 PostgreSQL 执行。

迁移前停止 API 写入、完成 PostgreSQL 逻辑备份并保留旧应用产物。使用 migration owner 的直连运行迁移；runtime 数据库角色继续受限。最终受审 policy 必须只授予金额账本所需的行锁访问，保留不可变触发器对账本改写的拒绝；归档元数据仅允许 status/version 迁移 UPDATE；`canonical_procurement_payment` 只能授予受限 API EXECUTE、不得授予 PUBLIC，且必须固定安全 `search_path`。失败时停止写入并做向前修复，严禁通过删除追加式付款/归档表、伪造 journal 或回滚二进制来破坏业务数据。旧格式升级测试通过不等于旧二进制能与新 API 互通；不得向旧客户端开放 HEIC 转换、冲销或附件归档操作。

COS Bucket 必须保持私有。仅服务端持有 `COS_SECRET_ID`、`COS_SECRET_KEY`；缺失全部 COS 变量时归档服务禁用，部分或无效配置必须启动失败。签名 URL TTL 限制为 60–900 秒（默认 900），不得记录 URL 查询串或授权头。若采用 STS，使用 `GetFederationToken` 获取仅限精确对象和对应 `PutObject`/`HeadObject`/`GetObject` 的临时身份；清理仅可在隔离测试前缀拥有显式 `DeleteObject` 权限。服务端必须独立 HEAD/GET 验证对象内容和 SHA-256，原始 HEIC 与 JPEG 派生文件分别归档、关联和哈希。Windows 原生直传不依赖浏览器 CORS。HEIC 解码使用锁定的纯 Rust `heic-rs 0.1.4`，最终 Windows 发行包必须用其提交的 Cargo.lock 构建并附带 `tests/fixtures/heic/LICENSE-MIT` 的 MIT 声明。
