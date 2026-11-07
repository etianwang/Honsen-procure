# V1 业务收尾及远程 Alpha 验收 — 2026-11-07

判定：**ALPHA_INTERNAL_TEST_BLOCKED**。本轮已交付可运行修复和完整升级候选，尚不能分发为公司内测就绪版，更不等同生产上线。真实云端没有被修改。

## 唯一候选及现场基线

- 最终应用源码：`248f06c95294eabf6337edd7f1f39f6e1f91f677`，任务分支 `codex/v1-business-closure-20261107`，已 Push。后续仅测试控制器和证据记录变更不改变该运行源码。
- [该源码 GitHub quality PASS](https://github.com/etianwang/Honsen-procure/actions/runs/42375225871)：格式、lint、typecheck、单元/真实 PostgreSQL、build、部署门禁、126 项 Playwright、完整 Linux 包流水线成功。
- 现场程序来源 `6b18850ee2e426fb68ac138fef866c4e4c718954` 已由真实 Manifest、原完整包及2232程序文件散列确认。包内014是包证据；本轮没有查询云端数据库台账。
- 现场 starter SHA256 `dd3c4406fdc456f565529ff6640a99c17756c17c16630b503df2666f695e469b`，保持其加载现有绝对路径.env的方式。上传的现场ZIP含.env，其内容未读取、复用或交付。
- 员工安装版固定 API：`https://api-pr.honsen.africa/v1`。编译 features=[]；不依赖用户环境变量，不向员工提供地址配置；真实安装版在线登录仍未验收。

## 功能贯通与修复

| 范围         | 本轮结果                                                                                                                             | 实际边界                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 账号管理     | 创建/查询及新增详情、CAS修改、角色替换、启停、解锁贯通UI→Rust→API→PG；审计、永久admin、大小写唯一、旧用户名兼容及显示姓名分离有回归  | 本地真实API/PG及HTTPS升级演练PASS；云端仍旧版，无新账号创建声明                   |
| 授权及同步   | 修复已认证请求在撤角色/停用/撤会话后仍可写的竞态；事务内锁定并复验实时角色、具体会话、installation、有效期；在幂等返回前拒绝失效权限 | 真实PG竞态从RED到PASS；C独立34项PASS；旧Outbox不因重试获得权限                    |
| 供应商及价格 | 复用原库/IPC/PushPull；联系地址、启停、多供应商多币种、追加历史、比较、备注；修复停用材料无法恢复、新建残留及分类静默清空            | 正常页面、可信SQLite及两原生客户端HTTPS/PG链PASS；备注是实际新增字段，不只是UI    |
| 采购执行     | 保持RFQ可选、直接选择现有报价；修复切换父单残留拆单状态；SPO/HPA签发、第二客户端冻结快照和重启/重放验证PASS                          | OPA完整公网链、全部人工异常路径未全量验收，原正式门禁保持OPEN                     |
| 收货及金额   | 修复收货双击重复提交；父单已有子单时Rust与云端均拒绝父单收货；显示真实子单终态并禁用动作；保留付款/冲销金额及审计约束                | Rust/真实PG金额、冲销、冻结、状态回归PASS；没有把它们称为安装版全流程PASS         |
| 六币种与三语 | RFQ复用既有六币种，新增XAF/ETB回归；材料/供应商/账号和采购界面三语有页面回归                                                         | 中法英及Excel/打印预览为真实renderer测试，多数自动UI测试mock IPC，不能替代原生API |
| 登录逻辑     | 修复云验证码延迟完成时清空新本地验证码答案的竞态，保留错误信息/改密入口及授权提示原边界                                              | deferred-cloud页面回归5PASS、独立1PASS；原生SPO正常界面重新登录后完成             |

用户名仅对新账号执行英文字母/数字；保留原始显示大小写，服务端大小写唯一。旧中文登录用户名/UUID/密码哈希不重命名。升级隔离库经正常管理API创建 Zhanghekai（张和凯，管理员+采购员）和ceshi1（测试1，工程申请人），分配同项目实际范围、首次改密及大小写登录PASS。运行时随机测试密码未写入源码或报告；这不是远程两账号已创建的证据。

材料是既有全局目录；供应商按国家，订单按项目/部门/班组过滤。没有另建供应商数据库，也没有把全局材料变更误报为项目数据泄漏。

## 迁移和部署兼容性

- PostgreSQL原有015保护管理员、016账号身份迁移保持校验不变，无新增017。兼容旧014结构的真实完整包升级已在隔离环境运行，不能据此假定云端真实ledger。
- SQLite新增 `0064_supplier_notes.sql`，仅加nullable备注列。旧payload缺notes保留现值，显式null清空；本地事务、Outbox、服务端JSON、第二端Pull均有实际覆盖。
- 共享JSON增加可选supplier.notes、material.categoryId声明，以及账号生命周期端点。新客户端备注同步需要本次服务端；旧6b服务端不应被当成匹配新功能的最终验收环境。
- 精确增加 `DELETE ON user_roles` 用于角色替换，保留原honsen_api，不增加usersDELETE或任意业务表DELETE。
- [中文完整包升级说明](../../deploy/baota/UPGRADE-6B18850.zh-CN.md) 已包含校验、备份、受控NOLOGIN/LOGIN栅栏、snapshot→增量migrate→grant、保留.env/start、停止后完整目录切换和失败停止。不Seed、不重置admin、不自动回滚不兼容数据库。
- 旧607KB Patch不适用。以后只有实际成功部署并重新采证的版本才能成为Patch BASE。本轮完整包是唯一推荐部署候选，**需要用户另行批准实际远程部署**。

## 实际测试证据

| 检查                        | 结果与限制                                                                                                                                                                                                             | 证据                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Format/Lint/Typecheck/Build | PASS；desktop三条lint warning（App/Attachment既有，Receipt终态同步一条），无error                                                                                                                                      | .cache/v1-business-closure；上述quality                              |
| Desktop / Shared            | 30 / 31 PASS                                                                                                                                                                                                           | quality及本地日志                                                    |
| Server + PostgreSQL         | 244 PASS，5 SKIP；3为无专用COS配置，2为旧082原SQL opt-in未注入路径。本轮另有实际6b完整包升级PASS                                                                                                                       | .cache/v1-business-a/server-final3.log                               |
| Rust / SQLite               | 186 PASS，7原有ignored（六个需人工原生更新对话框、一个canonical网络probe），不是PASS                                                                                                                                   | .cache/v1-business-closure/rust-integrated.log                       |
| Playwright                  | 最终源码CI126/126 PASS。Windows本地最后125PASS/1供应商下拉未选中，原断言未改，独立定向重跑1PASS；更早冷模块超时及失败保留                                                                                              | e2e-final.log、supplier-quote-recheck.log、quality                   |
| 双SQLite HTTPS / PG         | 原生AB账号隔离、伪造installation不采信、Push响应故障后重试幂等、冲突两版本保留PASS                                                                                                                                     | native-smoke-20261107153003.test.json                                |
| 原生供应商/HPA/SPO          | 两独立EXE/SQLite；离线登录写、重启保留、双供应商/四报价及大整数、备注兼容、启停、HTTPS Push/PG/Pull；12冻结字段、SPO草稿不提前签发、签发失败重试、更新价格不改快照、第二端重启和重放PASS                               | native-smoke-20261107153007.test.json，testedSha248、sourceDirty空   |
| 原生控制器                  | 新增目录链增加一次合法issuer重启，总4进程；旧控制器仍断言3而拒绝了PASS结果。仅测试改为目录模式精确4且校验9项目录结果；对已保存结果重新核验PASS                                                                         | tests/native/run-native-https-smoke.ps1；原失败日志保留              |
| 完整Linux升级               | Ubuntu24.04 / Node24.22.1 / PG16.15，原6b完整包→248完整包；BASE只seed一次；备份可读/归档比较；仅015016、目标不seed、同role保留；旧身份/密码哈希/角色/审计/历史表快照完全相等；新账号首改密登录及正式历史幂等不可变PASS | .cache/v1-business-a/upgrade-248f06c-final.log；A执行、C独立日志复核 |
| Linux文件/链接/密钥路径     | 2248 regular files、11内部相对symlink、Linux类型/0644与0755权限、19SQL各hash及所有目标文件checksum PASS；无.env/私钥/业务数据路径                                                                                      | .cache/v1-business-closure/zip-audit.log                             |
| Windows NSIS                | 真实0.1.18 installer build PASS，主程序/Runner/安装器PE版本一致，固定URL和features核验；通用凭据模式扫描未命中，扫描不是绝对不存在凭据的数学证明                                                                       | .cache/alpha-candidate-v1closure-018/build-receipt.json              |
| 打印 / PDF                  | 真实原生冻结SPO一页打印预览（纸型未核）及Windows保存PDF对话框已观察；工具无法正确选择WebView保存窗口，未生成PDF。该Hold运行最终等待关闭失败；另一次无Hold在CDP pages就绪前超时，均不能算整体PASS                                     | .cache/v1closure-offline-248/OBSERVATION.json                        |
| 安装/升级/卸载保留          | NOT RUN，不能安全接管既有未知Windows Sandbox；没有在用户主机安装/卸载来伪造隔离验收                                                                                                                                    | C安装记录                                                            |
| COS上传下载SHA256           | NOT RUN，缺专用受控测试配置；没有读取上传ZIP的真实.env或操作历史对象                                                                                                                                                   | COS原门禁OPEN                                                        |
| 公网员工安装版登录 / 双端   | NOT RUN：真实云端仍6b，本轮禁止升级；无混版本最终验收                                                                                                                                                                  | 本轮边界                                                             |
| Toolbox更新                 | NOT RUN；stable源、注册契约、appId/Runner参数均未更改                                                                                                                                                                  | 原Toolbox门禁OPEN                                                    |

所有合成数据均只在本地隔离测试库/测试SQLite。没有真实采购或付款，没有云端数据库写入。一次性PG Compose、匿名卷、keeper、升级数据库/角色/容器及敏感临时文件已清理；证据和原包保留。

## 最终交付

本地交付目录：`H:\Honsen\Honsen-Procure\.cache\v1-final-delivery-248f06c\`。

| 文件                                                                  | 大小            | SHA-256                                                          |
| --------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------- |
| honsen-procure-server-v1-248f06c95294eabf6337edd7f1f39f6e1f91f677.zip | 3,566,202 bytes | 15f9976d17a5eb15783975765f72a9b63bec6164d541b402a2c54a7056c75fc9 |
| Honsen-Procure-0.1.18-Alpha-Candidate-Setup.exe                       | 7,528,237 bytes | f89b74c71b215ac37e0b4547eb7701a2002ebae22865c3b4b7ed8c3a572e296e |

同目录提供SHA256SUMS、中文升级说明、Alpha已知问题及使用/反馈说明。745早期安装器和旧Patch仅保留历史，不交付为最终候选。没有创建Release/Prerelease、推stable或修改Toolbox源。

## 剩余放行门禁

- **BLOCKER**：安装版全新启动/在线登录、历史版本升级及卸载保留，真实PDF保存/打印、COS上传下载完整性，以及匹配服务器部署后的真实公网两业务账号/双客户端验收尚未通过。
- **DEFERRED（单独授权）**：真实宝塔升级；本轮明确禁止，需按备份/兼容性和唯一PM2边界另行批准，不是本轮已执行动作。
- **WARNING**：本地DOM/原生驱动原失败保留，CI最终126PASS；测试控制器末尾启动次数修正为目录扩展实际次数，不改变产品行为。旧opt-in更新人工对话框和Toolbox完整正式门禁保持开放。

不自动关闭M0–M4/T00–T15任何尚缺完整验收的父任务。可交技术人员审阅/准备部署候选，**尚不允许标为公司内部测试就绪**。
