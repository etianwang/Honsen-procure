# Honsen Procure V1 宝塔首次部署：按 1→11 顺序执行

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
for file in README-DEPLOY.md build-manifest.json .env.example apps/server/dist/index.js apps/server/dist/db/migrate.js apps/server/dist/scripts/bootstrap-v1.js deploy/baota/runtime-grants.sql start.mjs; do test -f "$file"; done
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

## 第 2 步：确认 PostgreSQL 数据库和用户

**在哪里执行：** 宝塔“数据库→PostgreSQL”创建或核对数据库honsen_procure及维护用户honsen_procure；Linux终端使用 `/www/server/pgsql/bin/psql`。用户当前库和两个角色已存在，下面条件判断只核查，不重复创建或重置密码。

宝塔普通维护账号不能创建角色。只有新的环境确实缺API角色时，才由PostgreSQL管理员postgres创建honsen_api；不能给维护账号临时授予CREATEROLE/SUPERUSER来绕过。

**输入：** PostgreSQL端口、postgres管理员密码；只有缺API角色才按 `\password` 两次输入新的honsen_api密码；最后输入维护账号密码。全新数据库及维护用户由宝塔界面创建并以维护用户为库所有者，不删除/重建已有库。

```bash
set -euo pipefail
cd /www/wwwroot/api-pr/v1
NODE_BIN=$(cat .deploy-node-path)
export NODE_BIN
export PSQL=/www/server/pgsql/bin/psql
test -x "$PSQL"
"$PSQL" --version
read -rp 'PostgreSQL端口 [5432]: ' PGPORT
export PGPORT=${PGPORT:-5432}
unset PGPASSWORD POSTGRES_URL
"$PSQL" -X -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres -W -v ON_ERROR_STOP=1 <<'SQL'
SELECT NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='honsen_api') AS create_api \gset
\if :create_api
CREATE ROLE honsen_api WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password honsen_api
\endif
\du honsen_api
\q
SQL
export PGHOST=127.0.0.1 PGDATABASE=honsen_procure PGUSER=honsen_procure
read -rsp '维护账号honsen_procure的密码: ' PGPASSWORD; echo
export PGPASSWORD
"$PSQL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT current_database(),current_user,version();
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
FROM pg_roles WHERE rolname IN ('honsen_procure','honsen_api') ORDER BY rolname;
DO $$ BEGIN
 IF current_setting('server_version_num')::int <> 160015 THEN RAISE EXCEPTION 'expected PostgreSQL16.15'; END IF;
 IF current_user<>'honsen_procure' OR current_database()<>'honsen_procure' THEN RAISE EXCEPTION 'wrong maintenance connection'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_get_userbyid(datdba)='honsen_procure') THEN RAISE EXCEPTION 'maintenance account must own this database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='honsen_api' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN RAISE EXCEPTION 'missing or privileged API role'; END IF;
END $$;
SQL
```

**成功看到：** 管理员侧 `\du honsen_api` 有该角色；维护侧当前库/用户honsen_procure、PostgreSQL16.15，honsen_api的高权限列均f、rolcanlogin为t，DO成功。当前用户不需要新建任何角色。

**失败必须停止：** 管理员或维护连接失败、角色缺失/过度授权、非维护所有者、数据库不符都不进入Migration。不要把CREATE ROLE交给普通维护账号，不授予SUPERUSER，不删除schema_migrations。

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

## 第 7 步：在宝塔 PM2 项目管理器启动

**在哪里执行：** 宝塔“网站→Node项目→添加PM2项目”，或编辑当前已有的唯一PM2项目。不要在终端执行pm2 start另建项目，不创建独立ecosystem.config.cjs。若面板提示该Node版本缺PM2，通过宝塔Node版本/模块管理安装PM2，再添加项目；不要重新安装项目依赖。

**输入/填写项：**

| 字段              | 实际值                                                         |
| ----------------- | -------------------------------------------------------------- |
| 项目类型          | PM2；自定义启动文件，不用配置文件方式                          |
| 项目名称          | honsen_procure_v1（已有项目沿用原名称，不并行新建）            |
| 项目目录/运行目录 | /www/wwwroot/api-pr/v1                                         |
| 启动文件          | /www/wwwroot/api-pr/v1/start.mjs                               |
| Node版本          | 24.22.1                                                        |
| 参数栏            | 留空；不填--env-file，也不填应用参数                           |
| 实例/模式         | 1 / fork，关闭集群和watch                                      |
| 项目端口          | 3000；不放行防火墙3000到公网                                   |
| 安装依赖          | 选择“不安装依赖”；ZIP已包含Linux node_modules                  |
| 运行用户          | www                                                            |
| 环境文件          | 入口从自身所在部署根目录加载.env；面板不再填写维护POSTGRES_URL |

终端只做启动前检查，不在终端另启动API：

```bash
set -euo pipefail
cd /www/wwwroot/api-pr/v1
unset POSTGRES_URL PGPASSWORD
test -f start.mjs
test -r .env
test -z "$(ss -ltnH 'sport = :3000')" || { echo '停止：3000仍有旧进程，先在宝塔停止已知旧项目'; exit 1; }
```

在宝塔保存并启动。`start.mjs`会先加载根目录.env，再导入API；路径按入口文件位置解析，兼容当前固定目录，不依赖工作目录或Node参数栏。没有.env时明确STARTUP_FAILED并退出，不输出连接串/密码；不存在同时运行index与start两套服务的步骤。

**成功看到：** 宝塔PM2唯一实例online；项目日志出现 `Honsen Procure API listening on 127.0.0.1:3000`。日志由面板管理，使用项目“日志”显示的实际路径，不猜测不同面板版本的目录。面板自动生成的内部PM2配置属于该项目管理器，不是额外创建的独立项目。

**失败必须停止：** .env未加载、STARTUP_FAILED、EADDRINUSE或项目反复重启都停止该项目，不进入反代。若旧index项目仍在运行，应在宝塔停止并编辑为start.mjs，不另建第二个活动项目。不使用pkill node影响其他项目。

## 第 8 步：验证本机 API

**在哪里执行：** 宝塔Linux终端root；同一PM2项目的日志界面。

**输入：** 项目日志界面显示的真实日志绝对路径。API探针无需密码。

```bash
set -euo pipefail
cd /www/wwwroot/api-pr/v1
ss -lntp | grep ':3000'
API_PIDS=$(ss -ltnpH 'sport = :3000' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
test -n "$API_PIDS"
test "$(printf '%s\n' "$API_PIDS" | wc -l)" -eq 1
ps -p "$API_PIDS" -o pid,ppid,user,args
readlink -f "/proc/$API_PIDS/cwd"
readlink -f "/proc/$API_PIDS/exe"
test "$(curl --show-error --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3000/api/auth/captcha)" = 200
curl --fail --show-error --silent http://127.0.0.1:3000/api/auth/captcha
printf '\n'
read -rp '宝塔PM2日志界面显示的实际日志绝对路径: ' API_LOG
test -f "$API_LOG"
tail -n 30 "$API_LOG"
stat -c '%a %U:%G' .env
```

**成功看到：** 只有一个API监听PID，127.0.0.1:3000；进程用户www、cwd为v1目录，exe为所选Node24.22.1；探针HTTP200并有id/question/expiresAt JSON。PM2守护进程自身不等于第二个API进程。面板可能将项目目录和.env拥有者改为www；.env仍须保持640或600，不能世界可读。

当前代码没有 `/health`。实际健康活性探针是 `/api/auth/captcha`，数据库连接已在启动和.env检查中验证；验证码200不代替登录、同步与COS验收。

**失败必须停止：** 非200、监听到公网、PID不唯一、日志启动失败、.env世界可读，都不进入公网反代。不批量杀未知Node进程。

## 第 9 步：绑定域名并配置宝塔 Nginx

**在哪里执行：** 宝塔软件商店确认Nginx已安装并启动；在该PM2项目的域名/外网映射中绑定 `api-pr.honsen.africa`，HTTP80转发内部3000；编辑该域名站点的Nginx配置。Cloudflare DNS填写服务器实际公网IP、开启代理，SSL/TLS选Flexible，边缘HTTPS/源站HTTP。

**输入：** 服务器实际公网IP；在现有server块中保留listen80、server_name、日志、证书验证路径和已有安全拒绝规则。把同名的三个location替换成下面内容，每种只保留一份；不要把server再嵌入server，不创建重复location。API站点不做项目文件静态直出，不能公开.env、node_modules或部署包。关闭此源站站点的强制HTTPS和重复自动反代，避免Flexible循环。

```nginx
location = /v1 {
    return 308 /v1/;
}
location ^~ /v1/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
location / {
    default_type application/json;
    return 410 '{"code":"client_upgrade_required","message":"API版本不可用"}';
}
```

**成功判断：** 保存的是此域名的HTTP站点配置，三个location无重复；`proxy_pass`末尾的斜杠必须保留，它把外部 `/v1/api/...` 转成内部 `/api/...`。客户端Base URL只含一个/v1，不再手工拼/v1。

**失败必须停止：** 面板拒绝保存、重复location、其他站点被覆盖、强制HTTPS仍开时不继续。Nginx语法及reload由第10步的连续命令验证，不能只看保存提示宣布成功。

## 第 10 步：验证 Nginx 和公网

**在哪里执行：** 宝塔Linux终端；公网测试使用真实域名。当前宝塔Nginx真实程序为 `/www/server/nginx/sbin/nginx`。

**输入：** 不需要数据库或COS密码。

```bash
set -euo pipefail
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
test "$(curl --show-error --silent --output /dev/null --write-out '%{http_code}' -H 'Host: api-pr.honsen.africa' http://127.0.0.1/v1/api/auth/captcha)" = 200
curl --fail --show-error --silent -H 'Host: api-pr.honsen.africa' http://127.0.0.1/v1/api/auth/captcha
printf '\n'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' -H 'Host: api-pr.honsen.africa' http://127.0.0.1/v2/api/auth/captcha)" = 410
curl --fail --show-error --silent --max-redirs 0 https://api-pr.honsen.africa/v1/api/auth/captcha
printf '\n'
```

**成功看到：** nginx -t成功后reload；本机HTTP/v1探针200、/v2拒绝410；真实公网HTTPS/v1探针200，无源站HTTPS重定向。Host头确保127.0.0.1测试命中正确域名站点，而非其他默认站点。

**失败必须停止验收：** 404、502、DNS/证书/代理失败、重定向循环均记录FAIL，不使用curl -k。隔离测试的本机Host映射或受信任测试HTTPS入口只证明路径/协议流程，不能当作真实Cloudflare公网PASS；尚未测公网必须标NOT RUN，由用户部署后实际验证。

## 第 11 步：真实 Windows 客户端验收

**在哪里执行：** 真实Windows客户端，不用SQL造业务、不用HTTP脚本冒充客户端。

**输入/填写项：** 连接设置的API Base URL填 `https://api-pr.honsen.africa/v1`；账号admin及第4步设置的密码；按客户端提示完成验证码。初始登录只提示改密，不强制；维护账号/数据库密码不能填到客户端。

**依次执行并保存结果：**

1. admin真实登录，确认超级管理员身份；在界面核对CI/CM及Bethel2办公楼、Kerene别墅、Minrex数据中心、14单位和0新站点。
2. 核对CI18%、CM19.25%国家默认税及3项目税费配置；印花按订单人工填写，不自动每单固定征收。
3. 用超级管理员界面配置合法采购/工程师/查看者角色和项目授权；分别验证允许、禁止和撤权，不能把admin登录成功当权限矩阵PASS。
4. 用授权测试业务在一个客户端创建、得到真实Push ack，再由另一客户端Pull；重启后历史保留。空Push被拒绝不代替非空同步成功。此版本缺认证头可能400，无效会话401；两者均是拒绝，不伪称已有业务写入成功。
5. 使用授权账号完成正式订单、付款及冲销，确认正式编号、历史快照、金额和权限保持正确。
6. 用明确归属的测试附件验证COS真实上传、完成、下载、原件/衍生关系及字节哈希和权限拒绝；只清理拥有的测试对象，不枚举或删除历史业务对象。COS配置格式正确或验证码200均不代替COS功能验收。
7. 在宝塔确认仍只有一个活动V1 PM2实例，保存项目日志/Nginx日志和验收结果，不保存明文密码/token。

**成功判断：** 每项都有实际客户端结果才分别记PASS；本轮未连接真实Windows客户端则整个客户端验收记 **NOT RUN**，由用户部署后执行。用户提供的PostgreSQL/Migration/Seed/授权/Node及本机Nginx200结果属于已报告的基础部署证据，不能自动扩展为公网、Windows、完整业务或COS通过。

**失败停止条件：** 任一实际检查失败记FAIL；未执行记NOT RUN，不宣布完整V1稳定发布。不要重复创建服务器PM2项目来尝试解决客户端故障。

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
