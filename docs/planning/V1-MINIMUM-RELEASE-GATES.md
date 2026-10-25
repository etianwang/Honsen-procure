# V1 Minimum Release Gates

本清单是发布建议，不取代 TEST-RULES、BUILD-TASKS、SECURITY 或现有 Formal hold。所有证据都必须绑定同一 release-candidate SHA、环境和原始工件；历史分支通过不自动复用到 RC。

## Phase A — 核心功能补齐

**目标：** 使采购、正式签发、收货/付款和同步数据模型形成可验证的业务闭环。

**前置：** 选择干净集成基线；不把 `13b22ff` 的有限 QA 当作 main 全量验收；对 legacy recovery 获得书面决定。

**必须：** T10-A/G2、T10-B/G3、T10-D/G4、T10-C/G5、T09/G6、T08 formal closure；T04 分类最小闭环；T11/T12/T13 的生产功能实施。

**退出：** 已签发订单在两端保留编号和所有冻结字段；冲突保留且显式收敛；付款/收货不重复；无未定义的永久失败重试；强制权限边界仍有效。

**可延期：** 仅不改变上述结果的视觉优化、Harness 重构和额外非必要组合测试。

## Phase B — 端到端集成

**目标：** 证明真实用户可完成关键流程，而不是证明单个页面或 mock。

**必须场景：**

- 权限：密码/CAPTCHA、离线 24h、禁用/撤销、角色和 self-approval；启用 TOTP 时在线和离线都要求 TOTP。
- 采购：材料/报价→申请→审批→OPA/HPA/SPO（适用路径）签发；历史快照不可变。
- 收货：至少两次 partial receipt、over-receipt reason、完成/条件完成、付款及 reversal。
- 同步：离线创建→网络恢复→ACK 后同步；重复 delivery；中断/restart；两端冲突→生产 resolver→收敛；漏 WS hint 后 cursor Pull 恢复。
- 文件与输出：授权附件、冻结快照 PDF/print/Excel、owner redaction、分页和三语言。

**退出：** T10-SEC-001、原始 P1、Formal hold 均由独立 QA 按既定范围正式签署；T14 的必要原始验收无未接受跳过。

## Phase C — 部署准备

**目标：** 从空环境形成可恢复的、可运行的正式服务。

**必须：** 受权的 PostgreSQL migration/initial super-admin/初始主数据演练；HTTPS/runtime config；backup/restore drill 和十日保留；无 secrets；Windows package 与 Toolbox contract E2E（安装、启动、失败 update、卸载保留数据）。

**外部决策：** 部署账户/种子数据、COS 配置、Toolbox installer/signing/release URL、legacy recovery policy。缺任一项时不能宣布可部署。

**退出：** 可从新机器安装、登录、创建首笔真实业务，并从受控备份恢复；T15 合同验收通过。

## Phase D — V1 发布

**目标：** 在单一 RC 上完成最小安全交接。

**必须门：**

1. T04–T13 的原始必需范围和 T14 独立 RC verdict 均完成；没有把 P0/P1 数据完整性或授权问题延期。
2. T15 安装/更新/卸载在目标 Windows 环境通过；更新 hash/target 失败安全且不重启应用。
3. 生产 migration、backup/restore、初始管理员和两名 enabled super-administrators 已确认；桌面不含 PostgreSQL 凭据。
4. 版本、回滚/支持说明、已知非阻塞事项和证据索引完成；获得明确发布授权。

**可随 V1.1 排期：** 性能微调、非关键样式、额外测试矩阵、开发 Harness 改善，以及所有已批准的 V2/deferred 模块。它们不能削弱上列数据、权限、恢复或发布门。

## 当前发布判定

**NOT READY。** 原因不是测试数量，而是关键业务读模型/冲突安全、legacy 恢复决策、files/output/backup、多语言治理、部署初始化和 Windows 发布路径尚未完成或尚无可归属的 RC 证据。当前可以继续独立开发 Phase A 切片；不应等待所有最终门才开始这些安全的切片。
