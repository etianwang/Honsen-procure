# 宝塔 Server Patch：按已验证运行产物增量交付

适用：Ubuntu24.04、Node24.22.1、PostgreSQL16.15，应用目录 `/www/wwwroot/api-pr/v1/`，API `https://api-pr.honsen.africa/v1`。宝塔现有唯一 PM2 项目仍管理启动与停止。本机制不 SSH、不发布 stable、不修改 Nginx/Cloudflare/其他应用，也不重新 Seed 或恢复 admin 密码。

## 1. 先确定真实 BASE，不能猜

保留每次部署的完整 Linux ZIP、外部 SHA-256、build-manifest.json、SHA256SUMS 和验收记录。更新前在当前应用目录运行 `sha256sum -c SHA256SUMS`，核对实际 Manifest 来源 SHA、符号链接目标、文件类型、大小与权限。它们必须与保留的 BASE 完整包一致；只有 Git HEAD、截图或 Manifest 存在都不够。不要读取或上传 `.env`。

服务器不匹配 BASE 时立即停止，保留证据；不能使用强制覆盖参数。完整包缺失、历史迁移或共享契约变化不能作为可直接安装的 Patch 交付。工具对共享 bundle 变化采取保守拒绝，即使它可能是兼容扩展，也必须走完整部署评审。本轮本地569基线仅是隔离验收基线，除非线上真实校验吻合，否则不是线上部署结论。

## 2. 获取固定 TARGET 完整产物

GitHub 唯一 CI 的 quality 成功后提供 `baota-server-<40位SHA>` artifact，内含完整 Linux ZIP 和其 SHA256。选择已验收的具体 SHA，不使用 main、latest 或分支 HEAD。GitHub artifact 外层下载 ZIP 只是容器，需要取出里面的完整运行 ZIP。CI 通过不等于真实业务/安装验收通过；保留对应验收记录。

也可在独立源码检出目录构建，绝不能在活动服务器目录 git pull/npm install：

```bash
# 在本地 Ubuntu/WSL 普通开发用户执行；先确认 Docker/compose/buildx。
export SOURCE_SHA='<已验收的40位TARGET源码SHA>'
bash deploy/baota/build-zip.sh
```

构建复用 Node24.22.1 Linux 容器、固定 lockfile 和生产依赖裁剪。完整包同时保留为必要恢复候选，不能把恢复候选视为可直接回滚到旧数据库。

## 3. 本地生成 Patch ZIP

在本地 Linux Node24 环境准备两份完整运行 ZIP，SHA256 从已验收记录读取，不能信任未知 ZIP 自带的散列：

```bash
bash deploy/baota/build-patch.sh \
  /absolute/BASE.zip '<BASE的64位SHA256>' \
  /absolute/TARGET.zip '<TARGET的64位SHA256>' \
  /absolute/new-output
```

需要 node24、python3、zip、unzip 和 sha256sum。脚本校验外部 SHA、ZIP 路径/重复项/类型/链接、内部完整校验清单及两个 Manifest 后，才按真实运行文件计算新增、修改、删除、未变化四类。依赖 node_modules、package-lock、共享入口和 SQL 都参与比较，保留权限和内部符号链接。没有远程 npm install。

产物 `honsen-procure-server-v1-patch-<BASE>-to-<TARGET>.zip` 包含 payload、完整 BASE/TARGET inventory 与 Manifest 摘要、DIFF.json、SHA256SUMS、校验/原子切换工具和本说明。只携带新增/修改的运行文件；`.env`、数据库/附件/备份和私钥不进入包。`start.mjs` 必须不变，不自动覆盖它。

新增迁移必须保持历史 SQL 字节不变、按原迁移顺序追加，并先经独立兼容性评审。默认拒绝含未评审新 SQL 的 Patch。确认为向后兼容的增量后，可为构建命令增加第六个参数：评审 JSON 路径，字段为 `baseManifestSha256`、`targetManifestSha256`、`review: "backward-compatible-additive"` 和精确 `migrations: [{name,sha256}]`。它是明确的评审记录，不是工具自动判定 SQL 无风险；不兼容必须改完整部署候选。没有新迁移时不要提供此参数。

## 4. 宝塔安装：一段失败就停止

以下由已授权维护操作人执行。不要把维护连接串、密码或 `.env` 内容贴入聊天、日志或 Git。只需上传一个 Patch ZIP；其外部 SHA256 必须来自已验收交付记录。先校验整个 ZIP 的可信散列，再用 Python 标准库只读取唯一固定工具条目到新目录，不展开其他内容；随后由该工具检查整个归档后再解压。不能使用陌生 ZIP 自带的散列给自己背书。

先确认现有 python3、unzip、GNU tar 和 PostgreSQL16 的 psql/pg_dump/pg_restore 可用；若宝塔客户端不在 PATH，只为当前维护终端指定已安装工具的真实路径。缺工具则停止，不自动安装、重装或改变全局配置。

```bash
set -euo pipefail
umask 077
LIVE=/www/wwwroot/api-pr/v1
# 按实际已安装 Node 路径设置；不安装或替换 Node。
NODE_BIN=/www/server/nodejs/v24.22.1/bin/node
test "$("$NODE_BIN" -p 'process.version')" = v24.22.1
test "$(realpath -e "$LIVE")" = "$LIVE"
# 填已上传的精确 Patch ZIP 与发布记录中的散列。
PATCH_ZIP=/absolute/honsen-procure-server-v1-patch-BASE-to-TARGET.zip
EXPECTED_SHA256='<交付记录中的64位SHA256>'
test "$(sha256sum "$PATCH_ZIP" | cut -d' ' -f1)" = "$EXPECTED_SHA256"
WORK=$(mktemp -d /www/wwwroot/api-pr/.honsen-patch.XXXXXXXX)
# 此处已核验整个ZIP的外部可信SHA；只提取唯一工具文本，不按归档路径写文件。
python3 - "$PATCH_ZIP" "$WORK" <<'PY'
import os,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries=[e for e in archive.infolist() if e.filename=='tools/archive-guard.py']
    if len(entries)!=1 or entries[0].file_size>65536:
        raise SystemExit('UNIQUE_TRUSTED_GUARD_REQUIRED')
    with open(os.path.join(sys.argv[2],'archive-guard.py'),'xb') as output:
        output.write(archive.read(entries[0]))
PY
python3 "$WORK/archive-guard.py" "$PATCH_ZIP" "$WORK/patch"
PATCH="$WORK/patch"
(cd "$PATCH"; sha256sum -c SHA256SUMS)
"$NODE_BIN" "$PATCH/tools/server-patch.mjs" verify-base --live "$LIVE" --patch "$PATCH"
```

现在在宝塔 Node/PM2 管理页核对唯一项目：脚本必须是 `$LIVE/start.mjs`、cwd 为 `$LIVE`、单实例 fork、空参数、原运行用户。记录真实项目 ID/运行 PID，停止**这一项目**。无法唯一识别则停止，不按名字猜，不运行 pm2 kill/stop all/restart all，不另建项目。工具随后会拒绝仍监听3000或仍从活动目录运行的 Node；它不会杀任何进程。需要有权限读取 `/proc`，不可验证也安全拒绝。

```bash
# 停止唯一项目后，先验证确实没有活动应用；此命令只检查不停止服务。
"$NODE_BIN" --input-type=module -e 'const m=await import(process.argv[1]); await m.assertStopped(process.argv[2])' "$PATCH/tools/server-patch.mjs" "$LIVE"
BACKUP=$(mktemp -d /www/wwwroot/api-pr/.honsen-backup.XXXXXXXX)
read -rsp '维护账号 PostgreSQL URI（不回显）: ' POSTGRES_URL; printf '\n'
export POSTGRES_URL
# PGDATABASE 使用环境传入，避免密码出现在进程参数。
export PGDATABASE="$POSTGRES_URL"
test "$(psql -XAt -v ON_ERROR_STOP=1 -c 'SELECT current_database()')" = honsen_procure
pg_dump --format=custom --file "$BACKUP/database.dump"
pg_restore --list "$BACKUP/database.dump" > "$BACKUP/database.toc"
test -s "$BACKUP/database.dump"; test -s "$BACKUP/database.toc"
tar -cpf "$BACKUP/application.tar" -C "$LIVE" .
test -s "$BACKUP/application.tar"
tar --compare --file "$BACKUP/application.tar" --directory "$LIVE"
(cd "$BACKUP"; sha256sum database.dump application.tar > SHA256SUMS; sha256sum -c SHA256SUMS)
psql -XAt -v ON_ERROR_STOP=1 -c 'SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name' > "$BACKUP/migrations-before.txt"
cp "$LIVE/build-manifest.json" "$BACKUP/build-manifest-before.json"
STAGE=/www/wwwroot/api-pr/v1.prepared-$(date -u +%Y%m%dT%H%M%SZ)-$$
"$NODE_BIN" "$PATCH/tools/server-patch.mjs" prepare --live "$LIVE" --patch "$PATCH" --stage "$STAGE"
cmp "$LIVE/.env" "$STAGE/.env"
cmp "$LIVE/start.mjs" "$STAGE/start.mjs"
"$NODE_BIN" "$PATCH/tools/server-patch.mjs" verify-target --stage "$STAGE" --patch "$PATCH"
```

副本在应用同级且全新；准备失败保留现场，不删除未知文件，不动活动目录。备份存在、非空、可列结构、完整文件比较和 SHA 全通过才继续。数据库备份仅针对明确的 honsen_procure，不包含其他数据库。

```bash
# 原维护账号执行既有迁移器/受控权限脚本，禁止运行 bootstrap-v1/recover-admin。
export NEW_ROLE=honsen_api
export MIGRATION_OBJECT_SNAPSHOT="$BACKUP/objects-before.json"
cd "$STAGE"
"$NODE_BIN" deploy/linux/grant-api.cjs --check
"$NODE_BIN" deploy/linux/grant-api.cjs --snapshot
"$NODE_BIN" apps/server/dist/db/migrate.js
"$NODE_BIN" deploy/linux/grant-api.cjs
psql -XAt -v ON_ERROR_STOP=1 -c 'SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name' > "$BACKUP/migrations-after.txt"
# 必须核对列表与TARGET Manifest完整匹配（仅原001有既定精确兼容例外）。
# 下面activate会复验BASE/TARGET、停机状态及实际备份，再原子交换同文件系统兄弟目录。
cd /www/wwwroot/api-pr
"$NODE_BIN" "$PATCH/tools/server-patch.mjs" activate --live "$LIVE" --patch "$PATCH" --stage "$STAGE" --backup "$BACKUP"
unset POSTGRES_URL PGDATABASE NEW_ROLE MIGRATION_OBJECT_SNAPSHOT
"$NODE_BIN" "$PATCH/tools/server-patch.mjs" verify-target --stage "$LIVE" --patch "$PATCH"
```

此时旧程序完整保留在 `$STAGE`，备份也保留，不自动清理。只在宝塔启动原项目；确认只有一个实例、路径仍为 `$LIVE/start.mjs`，禁止将旧目录也启动。健康检查：

```bash
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3000/api/auth/captcha)" = 200
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' https://api-pr.honsen.africa/v1/api/auth/captcha)" = 200
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' 'https://api-pr.honsen.africa/v1/api/accounts?username=Zhanghekai')" = 401
```

401仅证明受保护账号路由存在，不能代替登录。接着通过正常 Windows 客户端密码/CAPTCHA 登录 admin，查已有账号不重置密码；核对角色/项目、非空 Push ack 和第二客户端 Pull、正式订单不可变、附件真实下载 SHA 和原有历史。记录 PASS/FAIL/NOT RUN。健康200不等于全部业务通过。

## 5. 失败与恢复边界

任一步非0立即停止后续写入，保留日志、备份、新旧目录。prepare阶段失败不会覆盖 LIVE；activate原子交换失败没有逐文件/双rename降级。数据库迁移失败不要重复重试，不自动恢复数据库、启动旧 API、交换回旧程序或清空迁移记录。只有确认 SQL/共享契约兼容及备份目标后才另行批准恢复。失败后的目录存在或 PM2 online 都不是升级成功。

未知本地文件保留；如果它与 TARGET 新文件冲突则拒绝 Patch。若旧包目录包含未知子文件，删除清单只移除已知文件，保留未知内容。`.env` 和 `start.mjs` 不被 payload 覆盖。本机制不改变已有业务备份、COS 对象或其他宝塔服务。
