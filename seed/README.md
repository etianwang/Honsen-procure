# 统一基础数据 Seed

编辑 [master-data.json](master-data.json)；该文件是开发测试、上线首次初始化和获批准的后续补充所共用的唯一业务基础数据源。不要填入账号、密码、订单、审批、审计、冻结价格快照或真实秘密。

## 规则

- 所有 `code`、`sku` 都是稳定业务编码；关联使用这些编码而非数据库 ID。
- `unitPriceMinor` 是字符串整数最小货币单位：XOF `1250` 表示 1250 XOF，CNY/USD/EUR `1234` 表示 12.34。
- `rateBasisPoints` 是基点：`1800` 表示 18%。`rateDecimal` 必须是正十进制字符串，方向由 `fromCurrency` 到 `toCurrency` 明确指定。
- 日期一律 `YYYY-MM-DD`；币种仅 `XOF`、`XAF`、`CNY`、`USD`、`EUR`、`ETB`；语言对仅 `zh_fr`、`zh_en`。XOF/XAF 为零小数位，CNY/USD/EUR/ETB 为两位小数。
- Seed 只插入不存在且完整有效的数据；完全相同的记录跳过；已有不同记录会报告冲突并回滚。它不删除、不覆盖、不停用记录，也不接触订单或冻结快照。每条新增主数据在同一事务中写入同步 outbox 和带操作人的 Seed 审计；跳过及失败不产生这些记录。

## 字段

| 数组                    | 必填字段                                                                                                      | 可选字段                                              | 关联字段                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `countries`             | `code`, `name`, `timeZone`, `isActive`                                                                        | —                                                     | —                                                |
| `projects`              | `code`, `countryCode`, `name`, `site`, `departmentName`, `defaultCurrency`, `defaultLanguagePair`, `isActive` | —                                                     | `countryCode` → 国家                             |
| `sites`                 | `code`, `projectCode`, `name`, `isActive`                                                                     | —                                                     | `projectCode` → 项目                             |
| `departments` / `units` | `code`, `name`, `isActive`                                                                                    | —                                                     | —                                                |
| `teams`                 | `code`, `departmentCode`, `name`, `isActive`                                                                  | —                                                     | `departmentCode` → 部门                          |
| `taxTemplates`          | `code`, `name`, `rateBasisPoints`, `effectiveAt`, `isActive`                                                  | `countryCode`                                         | `countryCode` → 国家                             |
| `projectDefaults`       | `projectCode`, `departmentTitle`, `companyAddress`, `defaultCurrency`, `defaultLanguagePair`                  | `companyContact`, `defaultTaxCode`                    | 项目、税率编码；公司名称为全局配置，不在此处填写 |
| `materialCategories`    | `code`, `name`, `isActive`                                                                                    | —                                                     | —                                                |
| `materials`             | `sku`, `nameZh`, `model`, `specification`, `unitCode`, `isActive`                                             | `categoryCode`, `nameFr`, `aliases`, `brand`, `notes` | `unitCode` → 单位；`categoryCode` → 分类         |
| `suppliers`             | `code`, `name`, `countryCode`, `isPreferred`, `isBlacklisted`, `isActive`                                     | 联系方式、地址、付款/交货条款                         | `countryCode` → 国家；供应商只能供应同国家项目   |
| `materialPrices`        | `materialSku`, `supplierCode`, `currency`, `unitPriceMinor`, `unitCode`, `effectiveAt`                        | `sourceNote`                                          | 材料、供应商、单位                               |
| `exchangeRates`         | `fromCurrency`, `toCurrency`, `rateDecimal`, `effectiveAt`, `source`                                          | `reason`                                              | `source=manual` 时必须写 `reason`                |

测试账号和合成场景不属于这个文件；只能在显式 test profile 下由测试 fixture 加载。

## 执行与验证（Windows PowerShell，仓库根目录）

首次正式初始化前，先通过现有独立 `honsen-procure-bootstrap-admin` CLI 对明确指定的全新数据库建立管理员。**运行 Seed 前必须备份目标 SQLite 数据库及其 WAL/SHM 文件，并确认备份可恢复、路径正确、当前没有桌面程序写入。** 正式环境绝不执行 test profile 的 `clean`，也不要用真实业务数据库做试运行。

```powershell
$seedDb = 'C:\absolute\path\procure.test.sqlite' # 换成已创建的隔离测试库
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin honsen-procure-seed -- --profile test --database $seedDb --file seed/master-data.json
```

正式环境使用同一个 CLI 和同一份 JSON，只把 `--profile test` 改为 `--profile production`、`--database` 改为已备份的正式数据库绝对路径；正式路径不得以 `.test.sqlite` 结尾。执行器要求数据库文件已存在，且通过现有账号密码、隐藏式密码输入和本地图形/算术 CAPTCHA 登录。只有既有主数据授权角色可执行。不要把密码放在命令、JSON、脚本、Git 或日志里；离线登录需满足既有 24 小时已验证账号窗口。

提交前验证文件格式和真实导入/重跑/回滚测试：

```powershell
Get-Content seed/master-data.json -Raw | ConvertFrom-Json | Out-Null
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml file_sqlite_seed_import_is_atomic_idempotent_and_country_linked
```

CLI 成功后输出各类 `inserted`/`skipped` 数量。首次导入后重复执行应全部计入 `skipped`，无新增 outbox/审计。后续追加基础资料时，只增加稳定编码的新记录；已有编码的字段与数据库不同时，视为冲突，整份导入回滚。需要修改既有主数据时，应使用获授权的管理流程，不通过 Seed 覆盖。

若报 JSON 字段错误、编码重复、引用缺失、货币/日期/汇率错误，修正文件后重试；若报已有数据冲突，先核对数据库与文件，**不要删除或覆盖数据库记录来强行通过**。失败事务不会部分导入；确认原因后可安全重跑。测试 Profile 可按现有 `docs/OPA-2-DESKTOP-SMOKE.md` 准备测试账号和清理隔离库；正式环境没有 `clean` 命令。
