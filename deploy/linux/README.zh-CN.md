# Honsen Procure V1 RC：Ubuntu 24.04 / 宝塔手动部署

本手册交付候选包，不构成生产部署批准。Windows、Toolbox 联动及双客户端最终门禁未通过前，禁止向业务用户开放付款/COS 候选功能。`README.md` 是历史部署控制器的说明；本手册使用包根部 `honsen-procure.service`（源码 `manual/honsen-procure.service`），两套流程不可混用。API 仅由一个 systemd 单元管理，不同时使用 PM2。

## 1. 版本和目录

Windows 和 API 必须对应同一 Git SHA。核对包内 `GIT_SHA`、`POSTGRES_MIGRATIONS.sha256`、外部 SHA-256 清单；数字迁移前缀可重复，完整文件名和 checksum 才是身份。不得改写已应用迁移。API 先升级，随后匹配版本的桌面端；旧客户端不能据此获得冲销/HEIC 兼容性保证。

- `/www/Honsen-procure/app/releases/<SHA>`：候选程序，宝塔 `www` 管理。
- `/www/Honsen-procure/app/current`：指向单一版本。
- `/www/Honsen-procure/uploads`、`logs`：预留应用文件目录，`www:www 0750`。
- `/etc/honsen-procure/server.env`：运行账户连接串及 COS 密钥，`root:root 0600`，systemd 先读取再降权。
- `/etc/honsen-procure/migration.env`：独立 migration owner 连接串，`root:root 0600`，不交给 www。
- `/www/Honsen-procure/scripts`：root 保护的备份恢复脚本。
- `/www/Honsen-procure/backups`：`root:root 0700`；不允许 www 读取。

宝塔站点不得将 `/www/Honsen-procure` 或 `/etc/honsen-procure` 配为静态 root/alias。PostgreSQL 16 保持宝塔原数据目录和 postgres 用户，不移动数据库。仅监听本机或受控私网，桌面端只连 HTTPS。

## 2. 主机准备

安装 Node.js **24.18.0**，确认 `/usr/bin/node --version`；安装 PostgreSQL 16 的 psql/pg_dump/pg_restore、tar、sha256sum。宝塔需已有 `www` 用户。使用 root：

```bash
id www
/usr/bin/node --version
psql --version
install -d -o www -g www -m 0750 /www/Honsen-procure/app/releases /www/Honsen-procure/uploads /www/Honsen-procure/logs
install -d -o root -g root -m 0700 /etc/honsen-procure /www/Honsen-procure/backups
install -d -o root -g root -m 0755 /www/Honsen-procure/scripts
```

若 Node 位于宝塔其他位置，在安装 systemd 文件前将 ExecStart 改为已验证的绝对 Node 24.18.0 路径；不能依赖交互 shell 的 nvm/PATH。

## 3. 数据库账户

在宝塔 PostgreSQL 中创建独立数据库 `honsen_procure`、专用 owner/migrator `honsen_procure_migrator` 和运行账户 `honsen_procure_runtime`。均不得 SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS；runtime 不属于 owner 角色，不拥有 schema/table，不授予 public CREATE。仅 migrator 拥有该业务库及业务 schema。密码由部署人设置，不将密码作为命令行参数或写进 shell history。

`postgres/create-role.sql` 可供管理员交互使用；先用 psql 的 `\prompt -s` 输入其两个密码变量，再 `\i` 脚本，勿把示例密码照抄。数据库若已存在，先审计所有既有授权；本流程不会自动撤销未知旧角色。

安装两个 env 文件：运行文件参考 `.env.production.example`，migration 文件只含 owner 的 POSTGRES_URL。URL 密码须百分号编码；不得把迁移身份交给 API。

## 4. 构建、传输与迁移

在受控 Linux 构建环境 checkout 最终 SHA，Node 24.18.0、已提交的 lockfile。运行 `RELEASE_DIR=<仓库外的新目录> bash deploy/linux/scripts/build-release.sh`。缓存通过 `npm_config_cache` 指向构建盘；Windows/WSL 构建使用 E 盘映射路径。发布包已含 Linux 原生依赖、全部迁移、共享契约、权限策略及中文手册。不要在 Windows 直接复制 node_modules 充当 Linux 包。

在服务器校验 tar.gz 的独立 SHA-256 后解包。将 `RELEASE_SHA` 设置为交付的完整 40 位 SHA：

```bash
set -euo pipefail
: "${RELEASE_SHA:?设置交付清单中的完整 SHA}"
[[ $RELEASE_SHA =~ ^[a-f0-9]{40}$ ]]
BASE=/www/Honsen-procure
VERSION_DIR="$BASE/app/releases/$RELEASE_SHA"
install -d -o www -g www -m 0750 "$VERSION_DIR"
tar -xzf "honsen-procure-$RELEASE_SHA.tar.gz" -C "$VERSION_DIR"
test "$(cat "$VERSION_DIR/GIT_SHA")" = "$RELEASE_SHA"
(cd "$VERSION_DIR" && sha256sum -c POSTGRES_MIGRATIONS.sha256)
chown -R www:www "$VERSION_DIR"
```

首次部署也必须先停止所有写入者；已有服务先停机并完成下面的备份及恢复演练。owner 直连 PostgreSQL，不用事务池。在 root shell 内：

```bash
systemctl stop honsen-procure.service # 首次未安装时可忽略不存在单元
set -a
. /etc/honsen-procure/migration.env
set +a
export NEW_ROLE=honsen_procure_runtime
# 先以数据库管理员执行 ALTER ROLE honsen_procure_runtime NOLOGIN;
# 终止旧 runtime 会话并确认全部写入者已停止，才运行以下步骤。
export MIGRATION_OBJECT_SNAPSHOT=/etc/honsen-procure/migration-objects.json
cd "$VERSION_DIR/app"
node deploy/linux/grant-api.cjs --check
node deploy/linux/grant-api.cjs --snapshot
node --import=tsx apps/server/dist/db/migrate.js
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f "$VERSION_DIR/postgres/grant-runtime.sql"
node deploy/linux/grant-api.cjs
# 审核通过后以数据库管理员执行 ALTER ROLE honsen_procure_runtime LOGIN;
unset POSTGRES_URL
```

基础表使用明确对象清单；新表/sequence/函数使用已审 policy；未知对象 fail-closed。付款表只 SELECT/INSERT；attachments 仅 status/version_id 列 UPDATE，账本不可变触发器不能禁用。若 grant checker 拒绝，保留现场并修复，禁止宽授权绕过。

## 5. systemd 与 HTTPS

```bash
ln -sfn "$VERSION_DIR/app" /www/Honsen-procure/app/current
install -o root -g root -m 0644 "$VERSION_DIR/honsen-procure.service" /etc/systemd/system/honsen-procure.service
install -o root -g root -m 0755 "$VERSION_DIR/scripts/backup.sh" "$VERSION_DIR/scripts/restore.sh" /www/Honsen-procure/scripts/
systemctl daemon-reload
systemctl enable --now honsen-procure.service
systemctl status --no-pager honsen-procure.service
curl --fail http://127.0.0.1:3000/health
```

在宝塔建立 HTTPS API 域名、配置有效证书，按 `nginx/honsen-procure.conf` 合并代理段，替换域名/证书路径。只代理 127.0.0.1:3000，支持 WebSocket Upgrade，HTTP 跳转 HTTPS。用宝塔实际 nginx 二进制 `-t` 后重载。禁止公开 3000/5432。访问日志不记录授权头或签名 URL 查询串；模板关闭 access_log。

桌面配置 `HONSEN_SYNC_API_BASE_URL` 为 HTTPS API 地址；永远不能填 PostgreSQL/COS 密钥。初始特权账号使用受审 provisioning 程序和独立管理员权限创建，密码交互输入；每次启动仍要求密码和本地验证码，无公共注册。

## 6. COS

私有 Bucket，服务端设置 COS_REGION、COS_BUCKET、COS_SECRET_ID、COS_SECRET_KEY；TTL 默认900秒，允许60–900。部分配置会拒绝启动，全部省略才禁用归档。身份仅允许应用对象命名空间及 STS federation，临时策略限制到精确对象和 Put/Head/Get。不要开放公共读或把长效密钥交给桌面。不要记录预签名 URL。HEIC/JPEG 分别保留、关联、校验 SHA-256。备份数据库之外，还须独立保留 COS 对象版本/备份；数据库 dump 不含对象字节。

## 7. 备份、恢复、故障处理

由 root 定时执行备份，使用受保护的 owner/专用 backup 凭据，不能用 www 的运行 env；pg_dump 版本需与 PostgreSQL16兼容。首次先在**另一个空测试数据库**恢复并校验迁移日志、订单快照、付款账本、outbox关联和附件元数据，记录哈希、行数及实际读写。不移动宝塔 PostgreSQL 数据目录。

```bash
set -a; . /etc/honsen-procure/migration.env; set +a
BACKUP_DIR=/www/Honsen-procure/backups /www/Honsen-procure/scripts/backup.sh
unset POSTGRES_URL
```

备份脚本 custom dump、pg_restore --list 校验、原子落盘，只保留最近10份日备份；另存一份受控异机备份，清理前确认恢复演练。该脚本会按此既定策略清理过期的专属备份，勿指向其他目录。

恢复会覆盖目标库，必须获得明确人工授权并停止 API/其他写入。先验证 BACKUP_FILE；恢复脚本自动留 pre-restore 备份，再 `pg_restore --clean --if-exists --no-owner --no-privileges`。恢复后重新应用受审授权（否则权限未必恢复），核对 migration checksum、读写和 COS 对象可达后重启。例：

```bash
RESTORE_CONFIRMATION=I_UNDERSTAND_THIS_REPLACES_THE_DATABASE BACKUP_FILE=/www/Honsen-procure/backups/已批准恢复点.dump /www/Honsen-procure/scripts/restore.sh
```

迁移/授权/启动失败保持停机，保留新旧包、journal、日志和备份，向前修复；不得删账本/伪造迁移记录。仅当旧二进制与新 schema 的兼容性经过验证，才可把 current 切回旧包。服务文件替换和重启不是数据库回滚。

## 8. 最终验收记录

交付清单逐项填写真实环境结果：Linux 打包和启动、受限账户业务读写、迁移失败/重试、备份恢复、HTTPS及WebSocket、付款/冲销、私有COS、国家隔离及双桌面同步。CI、DOM或mock仅作为分层证据；最终 RC 未执行的真实门禁必须记为 BLOCKER，不得标记 READY。
