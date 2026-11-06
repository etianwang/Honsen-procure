# 宝塔 V1 候选包

目标 Ubuntu 24.04、Node.js 24.22.1、PostgreSQL 16.15。此包包含 Linux 原生运行依赖，无生产 Docker 要求。构建使用隔离 Linux 容器。正式上线须完成独立解包 P0 验收。

解压到 `/www/wwwroot/api-pr/v1/`，在宝塔 Node 项目管理器选择 Node.js 24.22.1，工作目录为该目录，启动文件 `apps/server/dist/index.js`。等效命令：

```sh
node --env-file=.env apps/server/dist/index.js
```

将 `.env.example` 复制为 `.env`，只填写运行角色凭据；不得使用数据库所有者作为 API 运行账号。初始化/升级必须使用包内受控 migration-runner（维护角色连接），禁止手工拼接 SQL 或将所有表授予运行账号。Seed 按独立入口的运行时参数执行，禁止提交初始密码。

## 首次空库初始化

仅要求 PostgreSQL 16 原生功能，不需要安装 pgcrypto 或其他额外扩展；UUID 继续使用内置 `gen_random_uuid()`，密码仍由 Node.js Argon2id 处理。

若旧包首次迁移报 `extension "pgcrypto" is not available`：先备份当前数据库和配置，停止活动 API，使用本修复包对**同一个数据库**重新运行下面的受控迁移命令。失败的 001 事务会回滚，已提交迁移由 runner 识别；不要 DROP DATABASE、清表、手工删改 `schema_migrations` 或重新执行 Seed 来“修复”迁移。

001 仅移除扩展声明。runner 和 Linux 已完成部署校验共用精确旧/新 SHA-256 兼容规则，已应用旧001的 checksum 与 applied_at 保留，不重新执行001，也不删除已有扩展；其他未知 checksum 或 SQL 内容变化仍拒绝。新数据库记录当前文件哈希。Manifest 列出实际 SQL 哈希和兼容校验模块哈希；SQL 迁移数量/版本不变。此兼容例外只对应本次已审查的一行删除，不能作为任意修改历史迁移的许可。

以下命令在部署根目录运行，使用宝塔已安装的 `psql`。先在宝塔创建空 PostgreSQL 数据库和维护所有者；不要对业务数据库重建或清空。

```sh
read -rsp '维护角色 PostgreSQL 连接串: ' POSTGRES_URL; echo
export POSTGRES_URL
node apps/server/dist/db/migrate.js
read -rsp '已批准的首次 admin 密码: ' INITIAL_ADMIN_PASSWORD; echo
printf '%s' "$INITIAL_ADMIN_PASSWORD" | node apps/server/dist/scripts/bootstrap-v1.js
unset INITIAL_ADMIN_PASSWORD
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1
```

在 psql 中创建独立运行角色（名称可统一采用以下值），通过交互密码提示设置密码：

```sql
CREATE ROLE honsen_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password honsen_api
\q
```

然后仍用维护角色执行受控的首次空库授权：

```sh
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -v runtime_role=honsen_api -f deploy/baota/runtime-grants.sql
unset POSTGRES_URL
```

将独立运行角色连接串填入本机 `.env`，宝塔 Node 项目使用该环境运行。上述 SQL 为首次空库初始化使用，不是现有生产升级授权脚本；现有数据库升级必须保留原受控升级机制及兼容性验证。迁移版本实际记录在 `schema_migrations`，禁止另行执行手工拼接的初始化 SQL。

首次 admin 密码由操作员运行时提供，不写在 ZIP 中；首次登录仅建议改密。Seed 重复执行不会重置密码。当前 Seed 包含 2 国家、3 项目、14 单位、0 新站点。按用户于 2026-11-06 确认的业务配置，CI 税率为 18%，CM 税率为 19.25%；印花税由订单人工填写，以订单币种的整数最小单位保存，不自动为每单征收固定金额。用户确认配置不代表本软件提供法定税率认定。最终验收状态以对应源码 SHA 的独立验收报告为准。

首次空库 Bootstrap 同时创建两国税模板和三个项目默认税配置，并写入同步发布记录。已运行旧版 V1 Bootstrap 的部署可在备份、停止活动 API 后，用维护角色运行受控的补充配置入口：

```sh
read -rsp '维护角色 PostgreSQL 连接串: ' POSTGRES_URL; echo
export POSTGRES_URL
node apps/server/dist/scripts/apply-v1-tax-config.js
unset POSTGRES_URL
```

该入口不读取或重置 admin 密码，不覆盖用户已保存的税配置；重复运行不会重复发布相同记录。新部署无须另跑此补充入口。部署时须检查返回状态和实际税模板、项目默认值；已有配置保留不等于自动改成新的税率。税费和人工印花税均需随正式单据冻结，后续配置变化不得重写已签发历史。

## 单活动路径

在宝塔现有域名 HTTP 站点添加以下 location；Cloudflare Flexible 回源 HTTP，源站不要强制跳转 HTTPS，否则会形成循环。公网域名仅发布 Cloudflare HTTPS，源站访问限制沿用已批准安全配置。

```nginx
location = /v1 { return 308 /v1/; }
location ^~ /v1/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
location / {
    default_type application/json;
    return 410 '{"code":"client_upgrade_required","message":"请升级客户端后重试"}';
}
```

未来切换前备份配置与数据库并验证恢复，停止 V1 后才启动 V2。将活动 location 改为 `/v2/`，旧 `/v1` 必须进入 410 拒绝，绝不能转发 V2。保留旧目录和原始 ZIP。回退必须先验证旧 API 对当前 migration schema 和业务 JSON／正式快照契约（包括人工印花税）的兼容性；同一 SQL 迁移版本不代表旧 API 能安全处理新快照。不兼容需经授权通过已验证宝塔备份恢复。仅复制文件不能回退数据库。

软件版本见 package.json，活动 API 版本为 v1，源码 SHA 见 build-manifest.json；数据库版本以 schema_migrations 实际记录为准。SHA256SUMS 校验包内文件，ZIP 外侧 `.sha256` 校验完整 ZIP。
