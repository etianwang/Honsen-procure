# V1 PostgreSQL 原生功能验收 — 2026-11-06

本轮限定结论：**PGCRYPTO_REMOVAL_ACCEPTED**。实际新 ZIP 在 pgcrypto 不可用的隔离环境中迁移、Seed、启动和权限验收通过。不是完整 V1 稳定发布；此前安装版、Toolbox、UAC 等父门禁保持原状。

## 源码与实际部署包

- 源码冻结：`6b18850ee2e426fb68ac138fef866c4e4c718954`，任务分支 `codex/v1-resume-20261104`，Commit + Push 已授权。
- ZIP：`H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-6b18850ee2e426fb68ac138fef866c4e4c718954.zip`。
- 大小：**3,501,576 字节**。
- 完整 SHA-256：`6e9f5db161b9a612f4e0314c735e7febad310b174a29714793203bd4f68ffff5`，Windows 实际重算；Linux SHA256SUMS 全部通过。
- 软件版本仍为 `0.0.0-development`；活动 API v1，`https://api-pr.honsen.africa/v1`；部署目录 `/www/wwwroot/api-pr/v1/`。未生成 V2 或新版 Windows 安装器。
- PostgreSQL 迁移仍为17份 SQL、最新 `014_master_data_currencies.sql`，不是新增迁移版本。SQLite、UUID生成格式、已有主键、正式编号和业务契约均未改。

## 全局审查与最小修复

审查服务器 SQL 迁移、查询、Bootstrap/税配置 Seed、测试及部署代码。唯一扩展声明是001首行；SQL只使用 PostgreSQL16内置 `gen_random_uuid()`。未发现 SQL `digest`、`crypt`、`hmac`、`gen_random_bytes`、`gen_salt`、PGP/encrypt/decrypt 等 pgcrypto 专属函数。搜索命中的 digest/HMAC 是 `node:crypto` 的 SHA/签名实现；密码仍使用 Node Argon2id，未改变安全算法、密码策略或 COS 签名。

只从001删除 `CREATE EXTENSION IF NOT EXISTS pgcrypto;`，其余 SQL 字节保持不变；不 DROP 已有扩展、不重写UUID/订单或主数据。五份上游 Toolbox 文档按指定顺序复查，当前改动不涉及其 appId、公开Manifest、Runner或注册表契约；原冲突门禁不在本修复中自动关闭。

## 已应用迁移的校验兼容

| 001版本              | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| 原始完整文件         | `22d91cb12793cfacd1d1ccc69fc2ab0b5bf6bbe996b3ceb32346931910905f2d` |
| 仅删扩展声明的新文件 | `bc2992a3fe39c2905d1b12527d6065626dd0858953fc8aaa3d5204ce93fcea6b` |

`migration-checksums.ts` 只接受同名001的上述**旧记录→新文件**精确组合。runner 和 Linux `verify-completed.sh` 共用此模块；其他文件、未知记录、正文修改及反向组合仍拒绝。不修改已有非空 checksum/applied_at，也不重新执行已应用001；原有空 checksum 回填逻辑保持不变。

Manifest 新增 `postgresRequiredExtensions: []`，同时固定兼容模块路径及SHA-256 `20bbd69a5186dc247326672eb6dee25482d0f082e093c505c2c7a93514c34b95`；全部17个实际SQL哈希逐一核对。Manifest构建时的NOT_YET_VERIFIED字段不回写，实际验收由本报告绑定完整ZIP哈希，避免验收后修改包字节。

本次历史迁移例外由用户明确授权，记录于 [DECISIONS](../DECISIONS.md)；不形成任意修改历史迁移的通用豁免。旧包保留只是回退基础，仍需检查SQL/业务JSON兼容和已验证数据库备份恢复。

## 实际无 pgcrypto 环境

本地 WSL2正常用户 `honsen-dev`、Docker Engine/Compose/buildx已验证。测试仅用独立Compose project `honsen-pgcrypto-removal`、loopback54329，使用随机测试凭据。

专用镜像从实际 `postgres:16.15` 派生，只在测试镜像移除 `/usr/share/postgresql/16/extension/pgcrypto*` 与 `/usr/lib/postgresql/16/lib/pgcrypto.so`。实际SQL证明：

- PostgreSQL16.15；`pg_available_extensions` 中pgcrypto为0。
- `pg_extension` 中pgcrypto为0。
- `pg_catalog.gen_random_uuid()`真实生成标准UUIDv4。

这不是只停用已安装扩展。全服务端测试环境与实际ZIP数据库均使用该镜像；API实际运行于独立Ubuntu24.04.5 / Node24.22.1镜像，新解包路径 `/home/honsen-dev/pgcrypto-proof-6b18850ee2e426fb68ac138fef866c4e4c718954/unpacked`。

## 实际执行结果

| 检查                  | 结果与边界                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 定向迁移/哈希回归     | 8 PASS；旧历史及业务行保留、重复执行、锁、未知001/003哈希拒绝、精确旧/新组合                                                                                                                           |
| 完整服务端 PostgreSQL | **219 PASS / 3 SKIP**；36文件通过/1跳过，32.64秒；所有PG测试实际执行，3个外部COS opt-in案例未重跑，与此数据库依赖修改无关                                                                              |
| 严格质量检查          | server typecheck、lint、build、受影响Prettier、shell syntax、diff检查通过；Node开发24.18.0按.nvmrc                                                                                                     |
| 旧首次失败重现        | 实际ZIP的同内容旧001在新隔离数据库报 `extension "pgcrypto" is not available`，psql预期exit3；001事务回滚、users不存在、schema_migrations保留且0记录                                                    |
| 同库重试新包          | 不清表/不重建该测试库，直接实际包runner执行全部17迁移并Seed成功                                                                                                                                        |
| Seed与登录            | admin真实CAPTCHA/密码登录、建议改密、不强制、实际改密、旧密码及旧会话拒绝；初始24同步记录                                                                                                              |
| 国家/项目/单位        | CI/CM；Bethel2办公楼、Kerene别墅、Minrex数据中心；XOF/XAF；14单位、0新站点                                                                                                                             |
| 税费                  | 用户确认CI18%、CM19.25%，2模板/3项目默认税；印花仍人工填写；实际订单兼容、显式0及冻结检查通过                                                                                                          |
| 运行角色/权限         | 独立非owner pgcrypto_runtime实际启动API，CREATE TABLE被42501拒绝；匿名、工程师跨项目/付款、禁用账号、撤销角色/项目绑定均安全拒绝                                                                       |
| 业务/重启             | OPA/HPA/SPO、付款/冲销6实体，幂等、快照冲突、全局行UUID guard通过；实际API重启后6payload完整相等                                                                                                       |
| 包内旧历史兼容        | 将仅测试数据库的001元数据设为精确旧哈希，实际compiled runner两次及从verify-completed提取的原始只读Node检查均通过；checksum/applied_at及全sync业务payload不变；未知哈希两者均拒绝，最后恢复该测试元数据 |
| 包内容                | 全SHA256SUMS及Manifest SQL/兼容模块摘要通过；禁止秘密文件名扫描0；不含真实密钥、cos.txt、.env或SQLite                                                                                                  |

Bootstrap失败注入测试的预期子进程异常保留于完整日志，Vitest总退出0，不将预期stderr当作产品故障。初次只读证明命令有shell引号错误，后改为SQL文件并成功执行；ZIP重启控制脚本末行Windows换行导致该子阶段未运行，修正测试脚本后单独实际重启/撤权全部通过，没有修改产品或重包掩盖问题。

本轮无桌面UI/SQLite/同步协议修改，本地未手动重跑DOM/Windows native/真实COS网络；这些未运行项目不关闭原安装版、完整安全或外部恢复门禁。此处实际包运行不以单元测试代替。

## 证据与清理

原始证据 `.cache/pgcrypto-removal/`：focused.log、server-full.log、database-proof.log、build-zip.log、package-prepare.log、package-checks.log、package-final.log、package-restart.log；公开子集在 `public-evidence/`。控制器使用实际tests/deploy/package-*脚本；兼容证明调用实际包compiled runner，并执行当前verify-completed.sh中的原始Node校验体。

精确清理已完成：owned API stop/rm；本project down --volumes退出0；container/network/projectvolume和3000/54329监听均0。keeper69411主动CtrlC退出1，不伪记exit0。只删除本轮生成的私密连接串/env/business-state；用户.env.test、cos.txt、真实SQLite、其他project与数据库均未改。原始公开证据与ZIP保留。

## 用户服务器操作边界

本轮没有SSH、没有访问、清空或重建用户服务器数据库，也未修改服务器其他数据库。操作员应先通过宝塔备份原数据库/配置并停止活动API，上传新包后用**原数据库连接**执行：

```sh
node apps/server/dist/db/migrate.js
```

执行时用原维护角色的POSTGRES_URL。成功后按包内README完成首次Seed/运行角色配置；已有Seed不要重置账号。无需额外安装pgcrypto，不要删除schema_migrations、手工跳过迁移或复制旧文件伪装成功。

本轮BLOCKER：无已知pgcrypto修复门禁未通过。DEFERRED：用户自行上传/同库重试及原V1完整发布门禁。WARNING：旧npm advisory/install-script提示未做无关依赖升级；旧部署数据库是否具有人工改动不在未连接的本地验收保证内。最终记录提交与构建源SHA分开，实际ZIP拥有源始终6b18850。

## CI 与未改动UI边界

[源码6b18850的CI](https://github.com/etianwang/Honsen-procure/actions/runs/42135505135)实际通过格式、lint、类型、全部workspace测试、构建、发布协议、PG部署授权、Linux Nginx/systemd集成及Linux候选构建。随后浏览器e2e70通过/1失败：`navigation.spec.ts:2487 catalog details and Honsen draft can reach later quote pages`，单价期望1025、收到1000。Desktop与该UI测试相对上一通过63c7d5d的CI未改；不能把这个失败隐去或解释成pgcrypto验收失败。本轮未顺带修改报价UI。最终记录Push会触发同代码边界的新一轮CI，最终答复给出该确切运行结果；首轮FAIL无论复跑结果如何均保留。
