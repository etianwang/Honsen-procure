# Honsen Procure Linux 手动部署包

此包面向 Ubuntu、宝塔 Nginx、Node.js 24.18.0 与 PostgreSQL 16。它只部署云 API；桌面端绝不能连接 PostgreSQL。生产部署前必须在独立 staging 环境完成本手册的构建、迁移、启动、备份和恢复演练。

## 1. 主机准备

安装 Node.js 24.18.0、PostgreSQL 16、`psql`、`pg_dump`、`pg_restore`、Nginx，并创建非登录服务用户：

```bash
sudo useradd --system --home /var/lib/honsen-procure --create-home --shell /usr/sbin/nologin honsen-procure
sudo install -d -o honsen-procure -g honsen-procure /opt/honsen-procure /var/lib/honsen-procure /var/backups/honsen-procure
```

数据库必须只监听 localhost 或私网；不得向桌面端开放 5432，也不得把连接串放入前端、Git 或安装包。

## 2. 创建最小权限数据库账户

以 PostgreSQL 超级用户执行 `postgres/create-role.sql`，将两个密码从受管密码库传入 psql 变量。随后创建数据库（所有者是 migrator）：

```bash
createdb -O honsen_procure_migrator honsen_procure
```

发布后先用 `honsen_procure_migrator` 连接串运行迁移；迁移成功后执行 `postgres/grant-runtime.sql`。服务的 `/etc/honsen-procure/server.env` 只使用 `honsen_procure_runtime` 账户，格式参考 `.env.production.example`。

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

解压经 SHA-256 验证的包至版本目录，将 `current` 符号链接指向该目录，并复制环境文件：

```bash
sudo install -d -m 0750 -o root -g honsen-procure /etc/honsen-procure
sudo install -m 0640 -o root -g honsen-procure .env.production.example /etc/honsen-procure/server.env
sudo -u honsen-procure env POSTGRES_URL='postgresql://honsen_procure_migrator:...@127.0.0.1:5432/honsen_procure' \
  /opt/honsen-procure/current/app/node_modules/.bin/tsx /opt/honsen-procure/current/app/apps/server/dist/db/migrate.js
sudo -u postgres psql -d honsen_procure -f /opt/honsen-procure/current/postgres/grant-runtime.sql
sudo install -m 0644 honsen-procure.service /etc/systemd/system/honsen-procure.service
sudo systemctl daemon-reload
sudo systemctl enable --now honsen-procure
sudo systemctl status honsen-procure
```

将 `nginx/honsen-procure.conf` 放入宝塔站点配置，先改为实际域名，再由宝塔申请/启用 TLS。Nginx 只代理 `127.0.0.1:3000`；外部只开放 HTTPS。确认 `curl http://127.0.0.1:3000` 的服务响应和 `journalctl -u honsen-procure` 无凭据泄露后才切换流量。

## 5. 备份、恢复与回退

每日任务以 runtime 连接串运行 `scripts/backup.sh`，目录必须是专用的 `honsen-procure` 目录；脚本校验 custom dump 后只保留最新十份。恢复前停止服务，指定 `BACKUP_FILE`，并显式设置确认值。恢复脚本会先验证输入并创建 `pre-restore` 备份，但恢复仍会替换目标数据库：

```bash
sudo systemctl stop honsen-procure
RESTORE_CONFIRMATION=I_UNDERSTAND_THIS_REPLACES_THE_DATABASE BACKUP_FILE=/var/backups/honsen-procure/honsen-procure-...dump POSTGRES_URL='postgresql://...' scripts/restore.sh
sudo systemctl start honsen-procure
```

发布回退只允许把 `current` 指回已验证的旧版本，并在确认其数据库迁移兼容后重启服务。不要通过回退二进制撤销已应用数据库 migration；必要时从已验证备份恢复，并记录操作授权和审计。

## 6. 上线前检查

- staging：构建、迁移、启动、受限 runtime 账户读写、备份、恢复、同步和国家权限隔离均实际通过。
- production：域名/TLS、服务账号、环境文件权限、Nginx 反向代理、数据库私网边界和监控由部署人逐项确认。
- 支付写入与冲销在其专门验证完成前保持禁用；本部署包不启用或绕过该限制。
