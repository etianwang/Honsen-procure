# V1 最终门禁关闭账本 — 2026-11-06

当前总判定：`V1_FINAL_RELEASE_BLOCKED`。本轮已执行真实 COS、HOST_NATIVE、必要产品修复及新 ZIP 解包验收；安装版、Toolbox、UAC 的原阻断仍未关闭。本文保留实际失败与未完成范围；单项通过不自动关闭 T00–T15/M0–M4 或安全/Formal 父任务。

## 冻结与产物身份

最终产品源码检查点：`0434990d355ae427724f32543ebe388d2aea1f22`。服务器 ZIP 实际构建源仍为 `332ef3d71d4279509d2522dd3f86c615a81bf0de`，包含行 UUID guard `ebfcaf2`。后续客户端冲突零版本和市场状态分页修复没有改变 server/shared/baota，主 Agent 已实际核对空 diff，因此按用户要求保留已验收 ZIP。Windows016及新debug实际构建源为0434990；不是把不同源记录拼成一个全通过候选。

| 项目                   | 实际值与边界                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 服务器软件版本         | `0.0.0-development`；候选，不是正式稳定发布                                                                            |
| 当前活动 API           | V1，`https://api-pr.honsen.africa/v1`；一套活动服务                                                                    |
| 服务器部署目录         | `/www/wwwroot/api-pr/v1/`；本轮未连接远程服务器                                                                        |
| PostgreSQL 迁移        | 17 个受控 SQL 文件，最新 `014_master_data_currencies.sql`；本轮 guard 无新迁移                                         |
| 桌面迁移               | SQLite `0062`；与服务器迁移独立，不改写旧正式快照                                                                      |
| 新 ZIP                 | `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-332ef3d71d4279509d2522dd3f86c615a81bf0de.zip` |
| ZIP 大小               | 3,499,589 字节                                                                                                         |
| ZIP SHA-256            | `276bf757f48719ed85b0107f01831f11dfd4b29af67a90801eaa88a031aaec7a`；主 Agent Windows 独立重算与旁文件相同              |
| 新 Windows 候选        | local `0.1.16`，`.cache/windows-final-candidate-0434990d/Honsen-Procure-0.1.16-Setup.exe`；仅构建，未安装、未发布      |
| Setup 大小 / SHA-256   | 7,470,805 字节 / `88ddbfdc999304350d6132dd7a78e9e3d1bf84d06fc5bfc6a73e999d87c773d5`；主 Agent 独立重算相同             |
| release 主 EXE         | `538419c77fe76acdfcf4f0d0af079a21e4e95a4d878d05fbc80adbbdee8f68ad`                                                     |
| release Runner         | `b17832c3ba5a01806aeea3229f9ee99a52db89afb38518ed9c7445905dfabcda`                                                     |
| 新 HOST_NATIVE EXE     | `7e236a98a7e7d058eadc7187ee85ac90b7a48bf7053e2c76de6699223a0d5721`                                                     |
| 新 test-profile helper | `ac2415c19ed9bfb655f575b286106a60e598d66773a213cc157439f1908c1c1f`                                                     |

新 HOST_NATIVE 主 bin/helper 在0434990实际构建，主 Agent 独立重算上述两哈希一致；它们是debug test-profile，与release/installed分开。旧31… EXE只绑定24a/8142阶段，不替代最终7e236…记录。Windows release候选有自己的完整哈希。

旧 ZIP `03c2c82…` / `59fa0cfd…`、旧 local014 `20ebacf` / Setup `42421555…` 以及旧 debug `26d1e317…` 均保留原拥有边界，只作历史证据。本轮发现真实生产服务器缺陷，故已重新生成 ZIP，没有用测试驱动修改掩盖产品缺陷。

## 必要修复与真实检查

服务器过去接受跨订单复用的行 UUID，原生 SQLite 则拒绝整页投影。新 guard 复用现有独占事务锁，授权、事件重放和版本检查后检查声明的行 ID；冲突保留本地/当前目标 payload，不泄露占用订单内容。软删除历史保留占用；同订单正常更新、幂等重放继续接受。未给所有旧 payload 强制新增 ID，也未改写历史正式记录。

客户端真实 producer 在 OPA 正式签发时才生成打印总额；消费者先收到 approved 页再收到 formal 页时错误拒绝。既有 producer/outbox 测试先稳定 RED，9 行修复仅允许未正式、approved/confirmed OPA 首次接收已经过 canonical 验证的派生总额；原规则、价格、印花及快照仍须完全匹配，已正式记录不可降级。相关 17 项、全 Rust lib 155 PASS/7 旧原生更新探针 ignored、fmt、Clippy exit0、真实主 bin/helper build PASS。既有 Clippy warning 保留，ignored 不算安装版通过。

服务器完整 PostgreSQL 套件最终 216 PASS / 3 opt-in COS SKIP；三项 COS 已另行真实运行，不冒称这是一条 219 全跑命令。新 guard 定向 3 项实际 PostgreSQL PASS。原负测夹具跨新订单复用行 ID 导致的前两轮失败保留，修正新夹具 ID 后原 QUOTE/formal-number/rate 断言不变。typecheck/lint/build/format 通过。

客户端还修复了两项实际发现的边界。`bd95eb2` 让结构化 conflict/version0 进入保留双 payload/原 Outbox、停止自动重试的既有冲突事务；accepted 仍要求版本≥1，缺失/负数版本、错误内容或 operation、跨账户仍拒绝。3项定向 RED→GREEN；不自动重生 UUID 或丢弃本地记录，空目标的人工恢复流程未扩展。`0434990` 修复非正式 Honsen 市场父单 confirmed 后错误跳过 executing/receiving/closed：只允许合法单向状态、其他整个 DTO 完全相同，只更新状态/版本，不重写金额/行。真实 producer 多页回归 RED→GREEN，篡改模式/价格/金额/印花、倒退和同版本变状态均拒绝、游标回滚。最终合并 Rust159 PASS/7既有ignored、fmt/Clippy/build通过。强化测试的 cursor/version 参数误用失败保留，修正测试参数而未放宽产品守卫。额外非强制 `-D warnings` 探测因既有style失败，没有算作PASS或改无关代码。

## 分层门禁

| 门禁                   | 当前结果                 | 准确边界                                                                                                                                                                                                           |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 原三项外部 COS         | PASS                     | PDF PUT/HEAD/GET/hash/错误签名拒绝/清理；实际 66 秒过期拒绝；Rust HEIC 原件/JPEG 衍生上传与归属。                                                                                                                  |
| 包 COS API             | PASS bounded             | 实际 ZIP dist 模块，现有 constructor 注入新 UUID 测试前缀；正常会话、权限、幂等、metadata/bytes。不是默认业务前缀写入。                                                                                            |
| 对象及 PostgreSQL 恢复 | PASS bounded             | 三个 owned 对象 versionId=null，备份→DELETE204/GET404→原 key 字节恢复；真实 archive 到新数据库后登录/Pull/下载一致。不是 non-null 版本恢复或异集群灾备。                                                           |
| 新 ZIP 独立解包        | PASS                     | Ubuntu24.04/Node24.22.1/PG16.15，实际 ZIP、新库迁移/Seed/非 owner runtime、登录改密、6 业务、新 guard、Nginx 活动映射及停用410/计数不变、重启历史、撤权。                                                          |
| HOST_NATIVE G1 核心    | PASS bounded             | 最终043新debug134500实际PASS：38拒绝、撤权401、4迟到401、4管理撤权401、重登/新scope、账户cursor/Outbox/双payload保留；不是安装版安全验收。                                                                         |
| 两客户端原生恢复       | PASS bounded             | 最终043新 EXE 对实际332包模块，strictTLS/limit1；两 fresh客户端69轮分别Pull、OPA/HPA/SPO exact历史、payment100+reversal100两实体/net0、PDF52B/HEIC4378B/JPEG18098B同哈希及衍生关系。HTTP创建历史，未冒充原生创建。 |
| 关闭只读/角色历史      | PASS bounded             | 独立真实native市场单8次ack→双方条件关闭，金额207/印花7/行不变；精确保存/改模式/重复关闭拒绝且row/line/outbox不变。scoped viewer可读不可写，无scope engineer缓存历史及附件拒绝；不是全角色/国家/项目矩阵。          |
| 当前安装版完整安全     | BLOCKED_POLICY / NOT RUN | 新候选未安装；历史 guest CreateProcess 被策略拒绝，没有重试或转宿主绕过。                                                                                                                                          |
| 含业务历史012→013升级  | BLOCKED_POLICY / NOT RUN | 空 SQLite/未知文件保留不替代认证历史与迁移证据；构建015不替代此项。                                                                                                                                                |
| Toolbox 完整链         | BLOCKED                  | 真实 caller 缺 apply、launch 参数冲突、stable 查询404、无既有受支持测试通道；没有伪造调用链或发布 stable。                                                                                                         |
| 真正 UAC 取消          | BLOCKED_ENV              | 无真实 prompt；host admin consent0，未改策略。取消安装向导不等于取消 UAC。                                                                                                                                         |

详细证据：[COS](V1-FINAL-GATE-COS-20261106.md)、[G1](FINAL-GATE-NATIVE-G1-20261106.md)、[原生恢复](FINAL-GATE-NATIVE-RESTORED-20261106.md)、[新包解包](V1-GUARD-REPACK-ACCEPTANCE-20261106.md)、[016构建](WINDOWS-CANDIDATE-016-0434990-20261106.md)、[guard与conflict0](SERVER-LINE-UUID-GUARD-20261106.md)、[安装/Toolbox/UAC](INSTALL-TOOLBOX-UAC-FINAL-GATE-20261106.md)、[独立 QA](V1-FINAL-GATE-INDEPENDENT-REVIEW.md)。

## 原始失败与限制

旧 G1 第三次 reauthentication_required 失败保留。本轮缺 CDP 模式、AntD loading 就绪竞态、旧 blanket 多账户 Pull 断言失败保留；随后正确就绪等待与更强账户 cursor/ownedOutbox/双 payload、known-ID、forged-origin 断言实际通过。冲突面板存在，本次未导航应为 NOT EXERCISED，旧 raw 的“面板不存在”错误措辞未当作产品事实。最终新EXE G1使用同一强断言驱动，首134000因3443占用在安全断言前基础设施FAIL；owned API停止交接后134500 exit0/coreResultPASS，raw `.honsen-native-qa/native-smoke-20261106134500.test.json` 已由主Agent和独立QA核对。生产API代码相对332包未变，G1使用测试启动入口而非宣称生产标准index已部署。

原生恢复第一次非法跨单行 ID 夹具导致 Pull 拒绝；第二次 driver 将 quantity 当作 SQLite 字段、实际列为 quantity_decimal，保留失败后仅修显式字段映射；第三次两客户端 baseline 全通过，后附加 HTTP 夹具 SPO close 遭服务端冻结比较拒绝。其 owner OptionNone/null 与缺省及 catalogPriceId:null 的形状差异真实存在，不能删掉断言将全配置分支标 PASS。未改旧正式数据，原生独立关闭流程不消除这项互操作限制。新native流程先暴露合法关闭已ack而另一客户端仍confirmed的真实缺陷，043修复后重跑。其后driver错误要求closed save_draft返回forbidden的失败也保留；trustedRust明确返回invalid_input，最终仅按精确合同校正，仍验证row/line/outbox无改，mode/重复close仍严格forbidden。最终PASS raw为 `.cache/native-restored-readback-733d8100-6db9-49d0-9570-7a20b582e3fd/evidence.test.json`，独立QA已逐项核对，不改写旧FAIL。

默认 API 地址、显式覆盖、干净 HTTPS、路径拼接及 retired410/426 终止重试测试属于既有产品边界并在本轮全 lib 中运行；SQLite/Outbox 不因配置而清空。实际 Nginx 验证与 Rust 单测分开记录。保留目录和 ZIP 仅提供回退基础，旧 API 是否能启动取决于 SQL/JSON/快照兼容性，必要时须经已验证宝塔数据库备份恢复；没有远程恢复或复制覆盖式“回退”。

## 待批准的 Toolbox 冲突修复

[具体提案](TOOLBOX-FINAL-GATE-REPAIR-PROPOSAL-20261106.md)分别申请 A 现有 caller 契约修复、B 仅集成构建的显式 HTTPS 测试通道。尚无用户回复，没有改冲突实现、canonical override 或 catalog。

依据 [AGENTS.md](../../AGENTS.md) 的 Toolbox 规则：“wait for approval before changing the conflicting implementation”。其他已授权测试、最小修复、构建和 Push 持续完成；这里的待批准事项不代表全部本地工作停下。UAC/安装还需允许执行且能产生真实 prompt 的隔离环境，代码批准不能替代环境前提。

## 发布状态与交接

- `SERVER_V1_READY`：新 ZIP 限定本地 Linux/P0 运行及独立复核通过；已知HTTP正式夹具关闭互操作限制保留，不推出完整原生/发布通过。
- `WINDOWS_NATIVE_QA_READY`：BLOCKED/PARTIAL；原生恢复不替代完整安装版安全与认证升级。
- `TOOLBOX_RELEASE_READY`：BLOCKED。
- `V1_FINAL_RELEASE_READY`：BLOCKED。

BLOCKER：当前安装版完整安全、含业务历史升级、真实 Toolbox 链和 UAC；原生限定范围已通过新EXE/新包组合与独立审查，完整角色/国家/项目及安装版仍未接受。DEFERRED：远程部署、生产恢复/回退执行、V2。WARNING：development 软件、既有 lint/build warning、旧产物仅回退候选。没有 SSH、生产数据库/历史 COS 访问、TLS 降级、正式稳定发布或 main 合并。

宝塔启动命令：`node --env-file=.env apps/server/dist/index.js`。ZIP 内 README/Manifest/SHA256SUMS 固定源、契约、迁移、Seed 摘要；生产配置和初始密码只在首次运行时提供。最终检查点由包含本文最终版的 Git 提交标识，任务分支 `codex/v1-resume-20261104`，后续文档 SHA 与产物 SHA 分开记录。

## 资源与最终记录

A仅清理本轮新UUID前缀manifest明确列出的3对象，逐项SHA核对、DELETE204、GET404，无bucket枚举或历史对象访问。owned restored API stop/rm、Linux3443无监听后才交接B；Windows/Linux私密URL/state/handoff/PFX/CA残留0，用户cos.txt与.env.test未删除。C自己的独立PG16.15 project已down --volumes，API/网络/卷和3000/54330/18081监听均无残留；015/016仅build没有启动安装器。B最终共享project精确down --volumes exit0；containers/networks/labelledvolumes与已知anonymous卷查询均0，Linux54329/3443无监听，own keeper30366主动CtrlC后exit1（未伪记exit0）；43条G1及28条restored测试vault精确清理后0残留，原始合成SQLite/media/evidence保留，未删除真实用户数据。

GitHub Actions quality不由本地PASS推断；043源码push运行因同ref后续证据push被并发取消。[7a13f1a实际CI](https://github.com/etianwang/Honsen-procure/actions/runs/42120136632)已completed/success；主Agent核对其后仅3份证据Markdown改动，生产及测试代码未变。最终记录提交的自动quality状态在最终答复另列，不把旧CI改标新SHA。独立最终审查提交52149a6已核定四项状态；最终cleanup证据d06aac0与02f80a7分别属于B/A。没有PR合并、正式Release或远程部署。记录格式/本地引用/状态一致性/diff检查独立执行；应用测试只针对上述确切代码边界复用。
