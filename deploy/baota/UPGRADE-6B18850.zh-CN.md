# 已运行 6b18850 的 V1 完整包升级

这是**人工批准后**的升级说明，不是首次部署说明。本轮开发不执行远程操作。旧约 607 KB Patch 不适用于现场，不能覆盖解压到运行目录，不能执行 Bootstrap Seed 或重置 admin。

仅适用于 `/www/wwwroot/api-pr/v1/`、数据库 `honsen_procure`。保持宝塔当前 Node 24.22.1、唯一 Honsen PM2 项目、`honsen_api`、Nginx、Cloudflare 和 `/v1` 不变。维护者必须先确认该 PM2 项目的真实目录和唯一进程；不按进程名猜测，不停止其他服务。

## 1. 校验和准备

使用本次最终报告给出的唯一完整 ZIP、完整源码 SHA 和 ZIP SHA-256。上传到独立包目录，在新建空目录解压，不能在活动目录混合新旧文件。核对 `build-manifest.json` 的 sourceSha、API v1、全部迁移散列，并在新目录运行：

```bash
export NEW_ROLE=honsen_api
sha256sum --check SHA256SUMS
"$NODE_BIN" --version
"$NODE_BIN" deploy/linux/grant-api.cjs --check
```

`NODE_BIN` 必须是宝塔现有 Node 24.22.1 的绝对路径。`NEW_ROLE=honsen_api`，维护连接通过受保护的现有输入机制临时提供给 `POSTGRES_URL`；不能把连接串写入命令记录、日志或发布包。不要为了执行检查安装或重装全局软件。

现场程序来源已确认是 `6b18850ee2e426fb68ac138fef866c4e4c718954`；包内最新迁移 014 不代表已经读取过实际数据库迁移台账。必须核对真实台账及历史迁移校验，不匹配则停止，不修改历史 SQL 或校验值来强行通过。

## 2. 停止 Honsen，验证备份

通过宝塔停止已明确识别的 Honsen 唯一项目，确认其进程退出及本应用端口停止。不要杀未知进程。用维护账号对 **honsen_procure** 做一致性 custom-format `pg_dump`，另将旧应用完整目录归档，保留原目录作为回退候选。备份目录必须唯一、受保护且不覆盖已有备份。

数据库备份必须非空且 `pg_restore --list` 成功、包含预期业务表；应用归档须能列出并校验内容。记录备份 SHA-256、原源码和迁移台账。空间不足或备份失败立即停止。

保留真实 `.env` 和现场 `start.mjs`，不打印 `.env`。已核验现场 starter 的 SHA-256：

`dd3c4406fdc456f565529ff6640a99c17756c17c16630b503df2666f695e469b`

该 starter 加载固定活动目录下的 `.env`，再导入 `./apps/server/dist/index.js`。不能自动替换成包内 starter，也不能把含 `.env` 的现场下载 ZIP 当作可分发包。

## 3. 增量迁移和精确授权

停止 API 后，由现有 PostgreSQL 管理员仅对 Honsen 运行角色执行 `ALTER ROLE honsen_api NOLOGIN`，并确认该角色已无活动连接；不修改密码、其他角色或全局设置。受控授权器要求这个维护栅栏，不能省略或关闭检查。

在完整新包目录、以原迁移所有者连接运行；维护连接只存在于当前受保护进程环境。`MIGRATION_OBJECT_SNAPSHOT` 是升级专用、绝对路径的受保护新文件，不能复用旧快照。依次执行：

```bash
export NEW_ROLE=honsen_api
"$NODE_BIN" deploy/linux/grant-api.cjs --snapshot
"$NODE_BIN" apps/server/dist/db/migrate.js
"$NODE_BIN" deploy/linux/grant-api.cjs
```

从已验证 014 基线预期仅追加 `015_protected_admin.sql` 和 `016_account_identity.sql`，不重新 Seed。015 保护永久 admin 和超级管理员治理边界；016 分离显示姓名和登录用户名、增加兼容的大小写唯一性检查。若旧账号存在大小写冲突，迁移必须失败并保留原数据，不能擅自重命名。

本候选还精确增加 `DELETE ON user_roles`，用于正常账号角色替换；不授予删除 users 或其他业务表的权限。保留原 `honsen_api` 角色，不创建替代角色或扩大成数据库所有者。供应商备注保存在现有同步 JSON 中，无新增 PostgreSQL 表或迁移；桌面 SQLite 自动追加 0064。

全部迁移和授权验证通过后，由同一 PostgreSQL 管理员仅执行 `ALTER ROLE honsen_api LOGIN` 恢复原角色登录能力，再进入目录切换和启动；不能改换运行角色。

任一步失败即停止后续写入，保存证据，不重复运行迁移，不启动旧版 API 猜测回退，不自动恢复数据库。

## 4. 完整目录切换

新包原始文件应先全部通过 `SHA256SUMS`。在停止状态把已备份的真实 `.env`、现场 starter 及明确属于 Honsen 的本地业务文件复制到新目录；未知文件不能擅自删除。符号链接必须保持相对链接及 Linux 文件类型，不能使用会把链接展开的目录下载包替代完整 Linux 包。

明确记录 starter 是唯一已知的包文件保留例外：最终 starter 校验现场散列，其余包文件仍校验目标清单，不能篡改 Manifest 来掩盖差异。只在同一文件系统、已确认完整新目录后切换 Honsen 活动目录，保留旧目录与备份。通过宝塔原项目启动，不能另起第二套 PM2 或 systemd。

## 5. 启动后验收和失败处置

检查唯一进程稳定、本机和公网 CAPTCHA 200；账号接口应返回正常受保护响应而非 404。经正常 CAPTCHA/密码登录验证 admin UUID、密码哈希未变，CI/CM 三项目、税费、正式号、金额、附件引用和审计保留。

管理员按正常审计流程检查再创建 `Zhanghekai`（张和凯，管理员＋采购员）和 `ceshi1`（测试1，施工申请人），授权 CI / Bethel2 的实际部门、班组。已存在则不重复创建或重置密码。初始密码只在受保护界面输入，首次改密。完成双客户端 Push/Pull、撤权、旧 Outbox、正式订单不可变和付款冲销验证。

启动、迁移或数据检查失败不能宣称升级成功。保留新旧目录、备份及日志，先检查 schema 与旧 API 兼容性，再由维护者批准恢复方案。禁止删除新迁移、自动回退不兼容 API 或猜测恢复数据库；不得影响其他宝塔业务。

此次成功部署并重新核验 Manifest/文件后，才能将该版本登记为以后 Patch 的 BASE。GitHub 最新 HEAD 本身不是线上 BASE。完整 Alpha 放行还需最终报告中的 Windows 安装、COS 和真实多端门禁。
