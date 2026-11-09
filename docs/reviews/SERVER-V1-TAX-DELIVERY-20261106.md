# V1 用户确认税率与手填印花税交付 — 2026-11-06

本轮税费配置及手填印花税闭环通过独立验收；原有完整安全/原生/发布门禁仍开放，整体保持 `SERVER_V1_BLOCKED`。此前“缺少国家税率/条件印花规则”的阻塞已按用户新决定解决，不再等待法律研究或自动印花适用规则。

## 实际配置与行为

- CI：18%（1800基点）；CM：19.25%（1925基点），明确属于用户批准配置，不宣称法律核实。
- 三项目默认税模板与国家/币种关联；初始化24条同步投影，仍为2国家、3项目、14单位、0站点。
- 既有候选可执行受控 `node apps/server/dist/scripts/apply-v1-tax-config.js` 补配置；保留密码与用户已改配置，未标记冲突安全拒绝，失败整笔回滚。
- 印花税为单据币种整数最小单位，由用户手填，独立列示并加入比例税之后合计，不进入比例税基。新输入默认0，不按每单强制1000，不自动推断法定适用性。
- 正式签发后冻结；旧字段缺省保留原形。旧客户端省略已有金额会形成可恢复冲突；显式0可清除未签发费用。
- SQLite增量0062为nullable字段及正式冻结trigger；无历史行回写。服务器PostgreSQL仍17迁移文件，最新014。

## 实际 ZIP

源码固定：`03c2c82b7a0a34cc4f360a293478e58fd529c8f3`。

```text
H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-03c2c82b7a0a34cc4f360a293478e58fd529c8f3.zip
```

大小：3,499,032字节。SHA-256：

```text
59fa0cfdb7176034c816015bd1fa55613244c7091bf9317507b61addc9e223cd
```

软件版本 `0.0.0-development`，活动API `v1`，统一URL `https://api-pr.honsen.africa/v1`，部署目录 `/www/wwwroot/api-pr/v1/`。最新桌面审计补充不进入此服务器ZIP；对比该SHA，server/shared/deploy生产边界无变化。API契约、三个Seed文件、迁移和完整内容由Manifest/SHA256SUMS及整包摘要固定；shared的实际25764字节JS为合并bundle，外部依赖同样受全包摘要覆盖。旧ZIP不覆盖。

宝塔Node24.22.1启动命令：

```sh
node --env-file=.env apps/server/dist/index.js
```

## 独立证据

[构建与代理报告](SERVER-V1-TAX-ZIP-20261106.md)、[独立HTTP报告](SERVER-V1-INDEPENDENT-20261106.md)、[Seed与运行角色回归](V1-APPROVED-TAX-SEED-20261106.md)。

- 新解包、新库、Ubuntu24.04/Node24.22.1/PG16.15、受限API角色实际启动通过。
- admin初始密码、非强制建议、实际改密、旧密码/旧session拒绝通过。
- CI/CM及三项目defaults实读；HPA/SPO的1800基点税450+手填37后合计2987，OPA的1925基点税46+手填37后合计323通过。都是测试订单，不是硬编码生产费用。
- OPA/HPA/SPO、付款冲销、重放、冻结冲突、旧字段省略冲突/显式0及重启六条完整历史记录保持通过。
- 停用账户、撤角色/项目授权、非owner DDL拒绝通过；Nginx活动映射/停用410及数据库三表计数不变通过。
- 本轮213 server tests PASS/3 liveCOS SKIP，全部PG套件实际执行，精确源码同包。Shared27 PASS及严格检查通过。
- Desktop typecheck/lint/unit30/build通过；Rust155 PASS/7原生交互/真实网络探针忽略，印花定向5通过；手填/审计DOM2、新XAF打印DOM1及原打印/SPO回归通过。打印和Excel单列手填金额，XAF按整法郎。

保留首次失败：XAF显示币种label由定向unit发现并修正；冷启动DOM导航超时；复制打印fixture把subtotal误改，安全schema拒绝，fixture修正后通过；审计fixture错误假设初次草稿已写revision审计/错误action过滤，已改为实际snapshot函数和真实revision路径验证，未放宽生产逻辑。此前历史d69失败仍保留，不冒称通过。

测试容器/网络/项目卷和相关监听已清理，测试密码/URL/state/env已移除；旧ZIP和公开证据保留。未SSH、未部署、未发布稳定版本。

## 门禁分类

- 本轮已批准税费/手填/ZIP范围：无已知BLOCKER。
- 完整V1原有安全、原生G1、installed/Toolbox/Formal门禁不自动关闭，所以不宣称完整SERVER_V1_READY。
- DEFERRED：授权的真实COS对象验收（3项缺少外部配置跳过）、原生/安装/生产备份恢复/回退验证。跳过的影响仍是相应最终条件未通过。
- WARNING：软件仍development，既有效应/chunk/依赖advisory/额外Clippy问题未扩大修复；更新后的Windows安装包未在本轮制作。

保留目录不等于可直接回退。必须同时核对SQL schema与业务JSON/正式快照兼容；不兼容时只能走经授权且验证过的备份恢复，不能直接启动旧API覆盖新业务字段。
