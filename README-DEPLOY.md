# Honsen Procure V1 宝塔首次部署：按 1→10 顺序执行

适用：Ubuntu24.04、宝塔、Node24.22.1、PostgreSQL16.15；目录 `/www/wwwroot/api-pr/v1/`；公网Base URL `https://api-pr.honsen.africa/v1`；Cloudflare Flexible，源站HTTP。数据库 `honsen_procure`，维护角色 `honsen_procure`，运行角色 `honsen_api`。用户当前两个角色已经存在，第2步只核对，不重复创建。

仓库唯一编辑源为 `README-DEPLOY.md`；`deploy/baota/README.zh-CN.md` 是字节一致的受检镜像，ZIP内两个旧名称也与本文件一致。不要从旧ZIP拼接步骤。软件版本、源码SHA、17份迁移及Seed摘要在 `build-manifest.json`；软件development、活动API v1、数据库迁移版本不是同一版本号。

以下Linux命令使用root和Bash。在同一个宝塔Linux终端依次完成第1～6步，保留该终端到第7步；不要启用 `set -x`、输出连接串、截图密码或把维护密码放入宝塔Node环境。任何标注“停止”的失败都不得继续。准备工作、Migration、Seed、授权全部在Node启动之前。没有生产Docker或npm install步骤，包已包含Linux依赖。

## 第 1 步：上传 ZIP 并解压

**在哪里执行：** 宝塔“文件”上传；宝塔Linux终端执行下面命令。已有Node项目先在宝塔项目列表点“停止”；已有数据库先用宝塔数据库备份功能备份。不要清空数据库。

**输入：** 本次交付ZIP绝对路径、交付消息中的完整SHA-256、宝塔Node24.22.1的真实可执行路径。ZIP上传到 `/www/backup/honsen-procure/packages/`，不要上传到待替换的v1目录。

```bash
set -euo pipefail
umask 077
mkdir -p /www/backup/honsen-procure/packages
for tool in unzip curl ss; do command -v "$tool" >/dev/null || { apt-get update && apt-get install -y unzip curl iproute2; break; }; done
read -rp '已上传ZIP绝对路径: ' ZIP_FILE
read -rp '交付ZIP完整SHA-256: ' ZIP_SHA256
[[ "$ZIP_FILE" = /* && -f "$ZIP_FILE" ]]
[[ "$ZIP_FILE" != /www/wwwroot/api-pr/v1/* ]]
[[ "$ZIP_SHA256" =~ ^[a-fA-F0-9]{64}$ ]]
printf '%s  %s\n' "$ZIP_SHA256" "$ZIP_FILE" | sha256sum -c -
test -z "$(ss -ltnH 'sport = :3000')" || { echo '停止：3000仍有服务，不要杀未知进程'; exit 1; }
if [[ -d /www/wwwroot/api-pr/v1 ]] && [[ -n "$(find /www/wwwroot/api-pr/v1 -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  BACKUP_DIR="/www/backup/honsen-procure/v1-$(date +%Y%m%d-%H%M%S-%N)"
  mv -- /www/wwwroot/api-pr/v1 "$BACKUP_DIR"
  printf '旧部署及.env已保留在 %s\n' "$BACKUP_DIR"
fi
mkdir -p /www/wwwroot/api-pr/v1
unzip -q "$ZIP_FILE" -d /www/wwwroot/api-pr/v1
chmod 755 /www/wwwroot/api-pr
chmod -R a+rX /www/wwwroot/api-pr/v1
cd /www/wwwroot/api-pr/v1
sha256sum --quiet -c SHA256SUMS
for file in README-DEPLOY.md build-manifest.json .env.example apps/server/dist/index.js apps/server/dist/db/migrate.js apps/server/dist/scripts/bootstrap-v1.js deploy/baota/runtime-grants.sql deploy/baota/start.cjs; do test -f "$file"; done
read -rp 'Node24.22.1绝对路径 [/www/server/nodejs/v24.22.1/bin/node]: ' NODE_BIN
NODE_BIN=${NODE_BIN:-/www/server/nodejs/v24.22.1/bin/node}
test -x "$NODE_BIN"
test "$("$NODE_BIN" --version)" = v24.22.1
export NODE_BIN
printf '%s\n' "$NODE_BIN" > .deploy-node-path
"$NODE_BIN" -e "const m=require('./build-manifest.json');console.log({source:m.sourceSha,api:m.apiVersion,migrations:m.migrations.length,latest:m.latestMigration})"
```

**成功看到：** ZIP校验OK、文件校验退出0，源码SHA，API为v1，迁移数量17/最新014；根目录直接有apps、deploy、node_modules，没有多套一层同名目录。

**失败必须停止：** 哈希不符、文件缺失、版本不符、旧服务未停都不能进入第2步。不执行覆盖解压、清库或删除旧ZIP。

## 第 2 步：配置 PostgreSQL

**在哪里执行：** 宝塔数据库界面核对；同一个Linux终端使用真实客户端 `/www/server/pgsql/bin/psql`。现有数据库/角色不重复创建、不改密码。

**输入：** PostgreSQL本机端口（默认5432）、维护账号 `honsen_procure` 的密码。

```bash
cd /www/wwwroot/api-pr/v1
NODE_BIN=$(cat .deploy-node-path)
export NODE_BIN
export PSQL=/www/server/pgsql/bin/psql
test -x "$PSQL"
"$PSQL" --version
export PGHOST=127.0.0.1 PGDATABASE=honsen_procure PGUSER=honsen_procure
read -rp 'PostgreSQL端口 [5432]: ' PGPORT
export PGPORT=${PGPORT:-5432}
read -rsp '维护账号honsen_procure的密码: ' PGPASSWORD; echo
export PGPASSWORD
"$PSQL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT current_database(),current_user,version();
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
FROM pg_roles WHERE rolname IN ('honsen_procure','honsen_api') ORDER BY rolname;
DO $$ BEGIN
 IF current_setting('server_version_num')::int <> 160015 THEN RAISE EXCEPTION 'expected PostgreSQL16.15'; END IF;
 IF current_user <> 'honsen_procure' OR current_database() <> 'honsen_procure' THEN RAISE EXCEPTION 'wrong maintenance connection'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_get_userbyid(datdba)='honsen_procure') THEN RAISE EXCEPTION 'maintenance account must own this database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='honsen_api' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN RAISE EXCEPTION 'missing or privileged API role'; END IF;
END $$;
SQL
```

仅**全新环境缺数据库/角色**才在宝塔新终端用实际PostgreSQL管理员执行此完整创建块。现有用户应跳过此块；连接密码错误、角色权限异常不能靠创建同名用户解决。管理员密码按psql提示输入，新角色密码按 `\password` 的两次提示输入。此块不重建已有库、不重置现有密码。

```bash
PSQL=/www/server/pgsql/bin/psql
read -rp 'PostgreSQL管理员账号 [postgres]: ' PG_ADMIN_USER
PG_ADMIN_USER=${PG_ADMIN_USER:-postgres}
read -rp 'PostgreSQL端口 [5432]: ' CREATE_PORT
CREATE_PORT=${CREATE_PORT:-5432}
"$PSQL" -X -h 127.0.0.1 -p "$CREATE_PORT" -U "$PG_ADMIN_USER" -d postgres -W -v ON_ERROR_STOP=1 <<'SQL'
SELECT NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='honsen_procure') AS create_maint \gset
\if :create_maint
CREATE ROLE honsen_procure LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password honsen_procure
\endif
SELECT NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='honsen_api') AS create_api \gset
\if :create_api
CREATE ROLE honsen_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password honsen_api
\endif
SELECT 'CREATE DATABASE honsen_procure OWNER honsen_procure' WHERE NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='honsen_procure') \gexec
SQL
```

新建分支完成后，在原Linux终端执行本步骤的核对块取得维护连接；不是跳过核对直接Migration。

**成功看到：** PostgreSQL16.15、当前库/用户均为honsen_procure，两行角色，honsen_api各特权列为f、rolcanlogin为t，DO成功。

**失败必须停止：** 数据库缺失、连接失败、非维护所有者或API角色有特权时不进入Migration。绝不授予SUPERUSER。

## 第 3 步：运行 Migration

**在哪里执行：** 保留维护账号密码的Linux终端，目录 `/www/wwwroot/api-pr/v1/`。

**输入：** 无新密码；Node连接串由维护账号信息安全生成，特殊字符自动URL编码，不显示连接串。

```bash
cd /www/wwwroot/api-pr/v1
! grep -nEi 'CREATE[[:space:]]+EXTENSION.*pgcrypto' apps/server/migrations/*.sql
"$NODE_BIN" -e "const m=require('./build-manifest.json');if(!Array.isArray(m.postgresRequiredExtensions)||m.postgresRequiredExtensions.length)process.exit(1);console.log('No PostgreSQL extension required')"
export POSTGRES_URL="$("$NODE_BIN" --input-type=module <<'JS'
const u=new URL('postgresql://127.0.0.1');u.hostname=process.env.PGHOST;u.port=process.env.PGPORT;u.username='honsen_procure';u.password=process.env.PGPASSWORD;u.pathname='/honsen_procure';process.stdout.write(u.href)
JS
)"
"$NODE_BIN" apps/server/dist/db/migrate.js
"$PSQL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name;
DO $$ BEGIN
 IF (SELECT count(*) FROM schema_migrations) <> 17 THEN RAISE EXCEPTION 'expected 17 migrations'; END IF;
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE checksum IS NULL OR length(checksum)<>64) THEN RAISE EXCEPTION 'invalid migration history'; END IF;
END $$;
SQL
```

**成功看到：** 无扩展要求；迁移命令退出0（正常可无输出）；schema_migrations有17行、最新014、校验值有效。已应用旧001时精确旧哈希获兼容且保留原记录，不手工更新哈希。

**失败必须停止：** 任何迁移异常、checksum mismatch、仍要求pgcrypto或行数不符都不进入Seed。此前首次pgcrypto失败也在原库直接重试受控runner，不能清库、删历史表或跳过001。

## 第 4 步：执行首次 Seed

**在哪里执行：** 同一Linux终端、同一维护账号连接，Node尚未启动。

**输入：** admin初始密码交互输入两次（已批准的首次值由操作员输入，不写入ZIP）。长度8～1024字符；普通改密仍执行系统密码策略。

```bash
cd /www/wwwroot/api-pr/v1
read -rsp 'admin初始密码: ' INITIAL_ADMIN_PASSWORD; echo
read -rsp '再次输入admin初始密码: ' INITIAL_ADMIN_PASSWORD_REPEAT; echo
test "$INITIAL_ADMIN_PASSWORD" = "$INITIAL_ADMIN_PASSWORD_REPEAT"
printf '%s' "$INITIAL_ADMIN_PASSWORD" | "$NODE_BIN" apps/server/dist/scripts/bootstrap-v1.js
unset INITIAL_ADMIN_PASSWORD INITIAL_ADMIN_PASSWORD_REPEAT
"$PSQL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT u.username,r.role,u.is_enabled FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.username='admin';
SELECT business_code,name FROM countries ORDER BY business_code;
SELECT p.business_code,p.name,p.default_currency,c.business_code AS country FROM projects p JOIN countries c ON c.id=p.country_id ORDER BY p.business_code;
SELECT count(*) AS unit_count FROM units;
SELECT business_code,country_id,rate_basis_points FROM tax_templates ORDER BY business_code;
SELECT project_id,default_currency,default_tax_template_id FROM project_print_defaults ORDER BY project_id;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.username='admin' AND u.is_enabled AND r.role='super_administrator') THEN RAISE EXCEPTION 'admin missing'; END IF;
 IF (SELECT count(*) FROM countries)<>2 OR (SELECT count(*) FROM projects)<>3 OR (SELECT count(*) FROM units)<>14 THEN RAISE EXCEPTION 'unexpected initial seed counts'; END IF;
 IF (SELECT count(*) FROM project_print_defaults WHERE default_tax_template_id IS NOT NULL)<>3 THEN RAISE EXCEPTION 'project tax defaults missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM tax_templates t JOIN countries c ON c.id=t.country_id WHERE c.business_code='CI' AND t.rate_basis_points=1800) OR NOT EXISTS(SELECT 1 FROM tax_templates t JOIN countries c ON c.id=t.country_id WHERE c.business_code='CM' AND t.rate_basis_points=1925) THEN RAISE EXCEPTION 'country taxes missing'; END IF;
END $$;
SQL
```

**成功看到：** initialized（重试可能already_initialized且passwordReset=false）；admin超级管理员；CI、CM；Bethel2办公楼、Kerene别墅、Minrex数据中心，币种XOF/XAF；14单位、2国家税模板、3项目默认税。CI18%、CM19.25%为用户批准配置；印花税按订单人工填写，无每单固定1000费用。首次登录仅提示改密。

**失败必须停止：** Seed失败、查询或断言失败不进入授权与启动。不要删除既有admin或用Seed重置密码；不匹配的已有业务库应停止排查，不按首次空库覆盖。

## 第 5 步：授权 honsen_api

**在哪里执行：** 同一Linux终端；psql仍以维护账号honsen_procure连接，不以honsen_api执行授权。

**输入：** 授权命令不要求新密码；随后输入honsen_api密码验证真实运行角色。

```bash
cd /www/wwwroot/api-pr/v1
"$PSQL" -X -v ON_ERROR_STOP=1 -v runtime_role=honsen_api -f deploy/baota/runtime-grants.sql
"$PSQL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='honsen_api';
SELECT has_table_privilege('honsen_api','users','SELECT') AS users_read,
 has_table_privilege('honsen_api','account_sessions','INSERT') AS sessions_write,
 has_table_privilege('honsen_api','sync_entities','UPDATE') AS sync_write,
 has_schema_privilege('honsen_api','public','CREATE') AS may_create_tables;
SQL
unset POSTGRES_URL PGPASSWORD
"$PSQL" -X -h 127.0.0.1 -p "$PGPORT" -U honsen_api -d honsen_procure -W -v ON_ERROR_STOP=1 <<'SQL'
SELECT current_user,current_database();
DO $$ BEGIN
 IF current_user<>'honsen_api' THEN RAISE EXCEPTION 'wrong runtime account'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'privileged runtime account'; END IF;
 IF has_schema_privilege(current_user,'public','CREATE') OR NOT has_table_privilege(current_user,'users','SELECT') OR NOT has_table_privilege(current_user,'account_sessions','INSERT') OR NOT has_table_privilege(current_user,'sync_entities','UPDATE') THEN RAISE EXCEPTION 'runtime grants incorrect'; END IF;
END $$;
SQL
```

**成功看到：** GRANT/COMMIT；三个业务权限t，may_create_tables=f；真实连接current_user=honsen_api、数据库honsen_procure、DO成功，各高权限均f。

**失败必须停止：** 授权/运行角色登录失败、缺权限或拥有SUPERUSER/DDL权限时不配置启动。不要用维护账号替代运行账号来绕过失败。

## 第 6 步：配置 .env

**在哪里执行：** 同一Linux终端，项目根目录。`.env`只给运行账号使用；不再保留维护连接环境变量。

**输入：** honsen_api密码，COS_REGION、COS_BUCKET、COS_SECRET_ID、COS_SECRET_KEY。COS长期凭据只留服务器文件，不复制到客户端或日志。

| 服务实际读取的变量                                       | 必填及含义                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| POSTGRES_URL                                             | 必填，honsen_api连接honsen_procure；密码需URL编码，下面命令自动处理                                     |
| COS_REGION / COS_BUCKET / COS_SECRET_ID / COS_SECRET_KEY | 本流程完整附件功能要求四项全部输入；全空时API虽能启动但附件返回503，不算COS验收完成；部分缺失会启动失败 |
| COS_SIGNED_URL_TTL_SECONDS                               | 可选整数60～900；代码默认900，下面明确写900                                                             |

监听地址/端口在实际index.js固定为 `127.0.0.1:3000`，没有HOST/PORT配置。认证是Node Argon2id+PostgreSQL account_sessions，不读取JWT_SECRET、AUTH_SECRET或独立设备密码；admin密码已经通过stdin写入Seed，不放入.env。

```bash
cd /www/wwwroot/api-pr/v1
unset POSTGRES_URL PGPASSWORD INITIAL_ADMIN_PASSWORD
cp -n .env.example .env
chmod 600 .env
read -rsp 'honsen_api密码: ' DEPLOY_API_PASSWORD; echo
read -rp 'COS_REGION: ' DEPLOY_COS_REGION
read -rp 'COS_BUCKET: ' DEPLOY_COS_BUCKET
read -rsp 'COS_SECRET_ID: ' DEPLOY_COS_ID; echo
read -rsp 'COS_SECRET_KEY: ' DEPLOY_COS_KEY; echo
export DEPLOY_API_PASSWORD DEPLOY_COS_REGION DEPLOY_COS_BUCKET DEPLOY_COS_ID DEPLOY_COS_KEY
"$NODE_BIN" --input-type=module <<'JS'
import fs from 'node:fs';
for(const k of ['DEPLOY_API_PASSWORD','DEPLOY_COS_REGION','DEPLOY_COS_BUCKET','DEPLOY_COS_ID','DEPLOY_COS_KEY'])if(!process.env[k])throw Error('必填值缺失：'+k);
const u=new URL('postgresql://127.0.0.1');u.hostname=process.env.PGHOST;u.port=process.env.PGPORT;u.username='honsen_api';u.password=process.env.DEPLOY_API_PASSWORD;u.pathname='/honsen_procure';
const values={POSTGRES_URL:u.href,COS_REGION:process.env.DEPLOY_COS_REGION,COS_BUCKET:process.env.DEPLOY_COS_BUCKET,COS_SECRET_ID:process.env.DEPLOY_COS_ID,COS_SECRET_KEY:process.env.DEPLOY_COS_KEY,COS_SIGNED_URL_TTL_SECONDS:'900'};
fs.writeFileSync('.env',Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});console.log('.env已写入，未输出秘密');
JS
unset DEPLOY_API_PASSWORD DEPLOY_COS_REGION DEPLOY_COS_BUCKET DEPLOY_COS_ID DEPLOY_COS_KEY
getent group www >/dev/null
chown root:www .env
chmod 640 .env
"$NODE_BIN" --env-file=.env --input-type=module <<'JS'
import {Client} from 'pg';import {CosStorage} from './apps/server/dist/attachments/cos.js';
const u=new URL(process.env.POSTGRES_URL);if(u.username!=='honsen_api'||u.pathname!=='/honsen_procure')throw Error('运行数据库角色/库名不符');
if(!CosStorage.fromEnvironment(process.env))throw Error('COS未配置');
const c=new Client({connectionString:process.env.POSTGRES_URL});try{await c.connect();const r=await c.query('SELECT current_user,current_database()');console.log(r.rows);console.log('COS配置格式通过，尚未执行真实上传下载');}finally{await c.end()}
JS
```

**成功看到：** current_user=honsen_api、current_database=honsen_procure，COS配置格式通过；秘密值不打印。`.env`拥有者root、组www、权限640，后续项目运行用户选择www。

**失败必须停止：** 数据库连接、账号、COS参数格式或文件权限失败不启动Node；格式通过不证明COS网络/STS/对象读写可用。已有.env会由本步骤交互值重新生成，旧部署原.env保存在备份目录。

## 第 7 步：在终端首次启动 Node

**在哪里执行：** 第一Linux终端前台启动；另开一个Linux终端做只读探测。

**输入：** 不再输入维护密码，不在命令行拼密码。

第一终端：

```bash
cd /www/wwwroot/api-pr/v1
unset POSTGRES_URL PGPASSWORD
NODE_BIN=$(cat .deploy-node-path)
"$NODE_BIN" deploy/baota/start.cjs
```

第二终端：

```bash
set -euo pipefail
cd /www/wwwroot/api-pr/v1
ss -ltnp 'sport = :3000'
curl --fail --show-error --silent http://127.0.0.1:3000/api/auth/captcha
printf '\n'
```

**成功看到：** 第一终端 `Honsen Procure API listening on 127.0.0.1:3000`；ss只监听127.0.0.1:3000；GET返回id、question、expiresAt JSON。当前代码没有 `/health`；真实活性探针是GET `/api/auth/captcha`，数据库连接在启动和.env检查中已实际验证，登录在第10步验证。

**失败必须停止：** STARTUP_FAILED、数据库认证失败、缺表/权限、COS参数错误、EADDRINUSE、非200、进程退出均不交给守护器反复重启。停止这个前台进程，保留日志排查；不能先把错误项目放到宝塔运行。

## 第 8 步：交给宝塔 Node 项目管理器

**在哪里执行：** 第一终端按Ctrl+C停止手动Node；宝塔“网站→Node项目→添加项目/现有项目设置”；Linux终端验证。

**输入/宝塔配置：** 名称honsen_procure_v1；目录 `/www/wwwroot/api-pr/v1/`；Node24.22.1；启动方式选择“运行文件/自定义启动文件”（不是npm dev）；启动文件 `/www/wwwroot/api-pr/v1/deploy/baota/start.cjs`；运行用户www；单实例/fork，不开集群、不启动第二版本。入口会自动加载根目录.env，不依赖面板是否自动识别.env，也不要在面板另填维护POSTGRES_URL。

启动项目前，终端执行：

```bash
set -euo pipefail
cd /www/wwwroot/api-pr/v1
unset POSTGRES_URL PGPASSWORD
test -z "$(ss -ltnH 'sport = :3000')" || { echo '停止：手动Node尚未退出'; exit 1; }
test -r .env
test -f deploy/baota/start.cjs
```

在宝塔保存并启动该唯一项目；在项目“日志”查看stdout/stderr，应有监听成功行。记录面板实际显示的日志文件路径，不猜测不同面板版本的日志目录。终端执行：

```bash
set -euo pipefail
API_PIDS=$(ss -ltnpH 'sport = :3000' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
test -n "$API_PIDS"
test "$(printf '%s\n' "$API_PIDS" | wc -l)" -eq 1
ps -p "$API_PIDS" -o pid,ppid,user,args
readlink -f "/proc/$API_PIDS/cwd"
readlink -f "/proc/$API_PIDS/exe"
curl --fail --show-error --silent http://127.0.0.1:3000/api/auth/captcha
printf '\n'
read -rp '面板日志界面显示的实际日志绝对路径: ' API_LOG
test -f "$API_LOG"
tail -n 30 "$API_LOG"
```

**成功看到：** 宝塔该项目运行，监听PID恰好1个，用户www，cwd为v1目录，exe为所选Node24.22.1，探针200，日志无启动失败。管理器守护进程自身不等于第二个API进程。

**失败必须停止：** 前台进程未退出、项目反复重启、多实例、运行用户不对、.env未加载或200失败均不绑定公网域名。不要使用全局pkill node，不影响其他项目。隔离演练若没有真实宝塔项目管理器，此步骤必须记录NOT RUN，不能用裸Node/普通PM2替代后宣称宝塔验收通过。

## 第 9 步：绑定域名并配置反向代理

**在哪里执行：** 宝塔“网站”创建/选择域名 `api-pr.honsen.africa` 的HTTP站点，设置中编辑该站点Nginx配置；Cloudflare界面确认DNS指向服务器、代理开启且SSL/TLS为Flexible。只改此域名站点，不覆盖整个nginx.conf。

**输入：** 服务器实际公网IP（填Cloudflare DNS）、本机实际Nginx可执行路径。关闭该宝塔站点的“强制HTTPS”和重复自动反代；不开放3000到公网、不在源站添加HTTPS重定向。

将这个站点的server块配置为：

```nginx
server {
    listen 80;
    server_name api-pr.honsen.africa;
    access_log /www/wwwlogs/api-pr.honsen.africa.log;
    error_log /www/wwwlogs/api-pr.honsen.africa.error.log;
    location = /v1 { return 308 /v1/; }
    location ^~ /v1/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location / {
        default_type application/json;
        return 410 '{"code":"client_upgrade_required","message":"请升级客户端后重试"}';
    }
}
```

宝塔保存配置后，Linux终端执行：

```bash
set -euo pipefail
read -rp '实际Nginx可执行路径 [/www/server/nginx/sbin/nginx]: ' NGINX_BIN
NGINX_BIN=${NGINX_BIN:-/www/server/nginx/sbin/nginx}
test -x "$NGINX_BIN"
"$NGINX_BIN" -t
"$NGINX_BIN" -s reload
curl --fail --show-error --silent --resolve api-pr.honsen.africa:80:127.0.0.1 http://api-pr.honsen.africa/v1/api/auth/captcha
printf '\n'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' --resolve api-pr.honsen.africa:80:127.0.0.1 http://api-pr.honsen.africa/v2/api/auth/captcha)" = 410
curl --fail --show-error --silent --max-redirs 0 https://api-pr.honsen.africa/v1/api/auth/captcha
printf '\n'
```

**成功看到：** Nginx配置有效；本机HTTP源站/v1探针200、/v2拒绝410；公网HTTPS/v1探针200，没有到HTTPS的源站重定向。`proxy_pass`末尾斜杠把 `/v1/api/...` 转为内部 `/api/...`；客户端Base URL只填 `https://api-pr.honsen.africa/v1`，业务请求再拼 `/api/...`，不再拼/v1。

**失败必须停止：** 域名错误、证书/DNS/代理失败、重定向循环、404/502、双/v1、停用路径没有拒绝时不进入公网登录验收。不使用curl -k绕过TLS。隔离测试的本机Host映射只证明源站路由，真实Cloudflare/DNS/HTTPS由用户部署后验证，不能标已完成。

## 第 10 步：最终验收

**在哪里执行：** 宝塔Linux终端执行只读/拒绝探测；Windows客户端执行有审批的真实业务与COS验收。只使用合法账号，不用SQL伪造业务单据或越过权限。

**输入：** admin实际密码、验证码答案；脚本只在内存使用token，不打印token/密码。一次新登录会按现有安全规则使旧在线会话失效。

```bash
set -euo pipefail
cd /www/wwwroot/api-pr/v1
NODE_BIN=$(cat .deploy-node-path)
read -rsp 'admin实际密码: ' DEPLOY_LOGIN_PASSWORD; echo
export DEPLOY_LOGIN_PASSWORD
VERIFY_SCRIPT=$(mktemp /tmp/honsen-verify-XXXXXX.mjs)
cat > "$VERIFY_SCRIPT" <<'JS'
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
const base='https://api-pr.honsen.africa/v1';
const c=await (await fetch(base+'/api/auth/captcha')).json();
const rl=createInterface({input:process.stdin,output:process.stdout});
let answer;try{answer=await rl.question('验证码 '+c.question+' ');}finally{rl.close()}
const installation=randomUUID();
let r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-installation-id':installation},body:JSON.stringify({username:'admin',password:process.env.DEPLOY_LOGIN_PASSWORD,captchaId:c.id,captchaAnswer:answer})});
assert.equal(r.status,200,'admin登录失败，请停止');
const login=await r.json();assert(login.user.roles.includes('super_administrator'));
const headers={authorization:'Bearer '+login.accessToken};
r=await fetch(base+'/api/sync/pull?cursor=0&limit=500',{headers});assert.equal(r.status,200);
const changes=(await r.json()).changes;
const countries=changes.filter(x=>x.entityType==='country').map(x=>x.payload);
const projects=changes.filter(x=>x.entityType==='project').map(x=>x.payload);
const taxes=changes.filter(x=>x.entityType==='tax_template').map(x=>x.payload);
const defaults=changes.filter(x=>x.entityType==='project_defaults');
assert.equal(countries.length,2);assert.equal(projects.length,3);assert.equal(defaults.length,3);
assert.deepEqual(taxes.map(x=>x.rateBasisPoints).sort((a,b)=>a-b),[1800,1925]);
console.log('admin登录/超级管理员/Pull/国家2/项目3/税率1800-1925/默认税3：PASS');
r=await fetch(base+'/api/sync/pull?cursor=0&limit=1');assert.equal(r.status,401);
r=await fetch(base+'/api/sync/push',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({deviceId:installation,events:[]})});assert.equal(r.status,400);
console.log('匿名访问拒绝、空Push安全拒绝：PASS；没有创建业务数据');
console.log('仍需用户真实验证：非空Push/Pull双客户端、角色/项目撤权、COS原件/衍生上传下载及哈希、重启恢复。');
JS
if "$NODE_BIN" "$VERIFY_SCRIPT"; then
  rm -f -- "$VERIFY_SCRIPT"
  unset DEPLOY_LOGIN_PASSWORD
else
  rm -f -- "$VERIFY_SCRIPT"
  unset DEPLOY_LOGIN_PASSWORD
  echo '停止：终端最终验收未通过'
  exit 1
fi
```

**成功看到/用户逐项记录：**

- 真实验证码探针200、admin登录200且super_administrator；Pull有CI/CM、三个已批准项目、国家默认税和项目税配置。首次库有24条初始发布记录、14单位、0新站点；已有业务数据不能继续用首次数量断言覆盖。
- 匿名接口401、空Push400。这个拒绝测试不能代替非空Push/Pull成功；用户应在Windows客户端使用正式授权的测试业务，记录Push真实ack、另一客户端Pull及重启后保留。
- 用户通过Windows超级管理员界面配置合法采购/工程师/查看者角色和项目范围，实际验证允许/拒绝及撤权，不能靠admin登录成功替代权限矩阵。
- COS配置格式通过只是第一个检查；用户部署后用合法归属的测试附件验证真实上传、完成、下载、原始/衍生字节哈希和权限拒绝。只清理明确拥有的测试对象，不枚举/删除历史业务对象。不把503、只HEAD或伪签名当COS成功。
- 宝塔只有一个活动V1项目；保存项目日志、Nginx日志和验收结果，不保存明文密码/token。

**失败必须停止验收：** 任一已执行检查失败即记录FAIL；真实宝塔接管、公网Cloudflare、业务同步、角色或COS未执行则记录“待用户部署后验证/NOT RUN”，不能宣布全项生产验收完成。本流程不会自动发布稳定版本。

## 附录：未来升级与回退

升级先用宝塔备份数据库和配置并验证可恢复，停旧API后才迁移/切换；不能同时运行同公司的V1/V2。V2目录独立，停用/v1必须410而不是转发V2。旧目录、原始ZIP保留。回退必须验证旧API对当前SQL迁移及业务JSON/正式快照的兼容性；不兼容通过已验证的宝塔备份恢复处理，不能复制旧文件覆盖当作回退成功。

## 附录：故障诊断

- `extension "pgcrypto" is not available`：确认ZIP Manifest无扩展要求且001不含CREATE EXTENSION；停止使用旧包。新runner兼容精确旧001哈希；不要手工改checksum或删表。
- `STARTUP_FAILED`：看错误code、Node版本、.env权限及维护/运行角色是否混用；EADDRINUSE需停止已知旧项目，不批量杀Node。
- `28P01`认证失败：核对所用角色密码/端口和.env中的URL编码；不展示连接串、不授予SUPERUSER。
- `42501`权限/`42P01`缺表：核对Migration、Seed和runtime-grants的成功记录；不以维护账号运行API绕过问题。
- `ATTACHMENTS_UNAVAILABLE`：四个COS值全部为空。部分值缺失或TTL越界会在启动验证失败；配置正确也需真实对象读写验收。
- 502查唯一项目和127.0.0.1:3000；循环跳转查源站强制HTTPS；404查/v1/末尾斜杠及实际/api/...路径。

规范来源：宝塔官方 [Node项目说明](https://docs.bt.cn/practical-tutorials/nextjs-deployment/) 和 [Node/PM2说明](https://docs.bt.cn/practical-tutorials/nodejs-pm2-deployment/)。实际面板菜单以用户安装版本为准；不据此声称本机已经完成宝塔界面、公网DNS或Cloudflare操作。
