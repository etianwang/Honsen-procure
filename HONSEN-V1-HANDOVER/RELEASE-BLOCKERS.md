# 上线与交接未完成项

HANDOVER_FREEZE 保持；封存成功不等于 RC 或生产验收。没有 P0 新结论，没有自动关闭原 Formal/security hold。

| 分类                    | 问题 / 证据                                                                                                                                                       | 恢复动作                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| BLOCKER（生产）         | 冻结安装器真实 P1 split installation：Unicode 自定义 /D 目录有程序文件，HKLM/uninstall 却指向默认目录，Runner launch 找不到 manifest；7ef0284 和归档 agent-c JSON | 先取得已列出的有限合同修复批准，修复 NSIS 目录初始化 + Runner NSIS adapter，独立真实 Windows 重查 |
| BLOCKER（生产）         | Runner Inno 参数与 NSIS 不匹配；更新 URL、launch 额外参数/更新选项及 Toolbox apply 联调差距                                                                       | 保留公有参数、result JSON、身份及数据边界；逐项批准/修复/验收                                     |
| BLOCKER（PR验收）       | #19/#20 当前 HEAD 仍有 owner quote E2E 失败，最新付款冲突与 HPA 独立重查待做                                                                                      | 不称 flake；解除冻结后在各原任务调查，再独立验收                                                  |
| BLOCKER（生产）         | 安装版真实撤权后重登、双 Windows 付款/冲销/重启/COS/权限联测未完成；主机 error8 属环境历史，干净 guest vault 探针 PASS 仅证明环境                                 | 使用既有 test-profile/native 脚本和明确授权测试 COS；不能把 DOM/探针当应用 PASS                   |
| BLOCKER（生产）         | G4 双端冲突收敛、Formal hold、Security FIX1 文件 symlink 等原门禁未正式关闭                                                                                       | 对确定最终 SHA 复核原 acceptance gate，不借交接扩项或降门槛                                       |
| BLOCKER（交接，条件项） | 选定敏感配置/59个SQLite快照已本机加密；用户尚未确认已微信保存密文和独立密钥，内部Codex snapshots仍原地保留                                                        | 按PRIVATE-RECOVERY保存/验证敏感包；不能明文上传公开GitHub，也不能宣称所有内部历史已备份           |
| DEFERRED                | SPO 正式签发、PDF/Excel/打印、完整三语 UI、订单关闭永久保留，以及 T04/T08–T15 剩余原验收                                                                          | 先恢复，再从 BUILD-TASKS 选一个最小未阻塞子任务；不在 freeze 开发                                 |
| DEFERRED                | Linux 真实宝塔环境、受限角色、备份恢复、生产权限/部署授权                                                                                                         | 固定 RC 的 Linux CI 仅限其环境；用户另行批准并手动部署；不采用未复核 www WIP                      |
| WARNING                 | npm ci 报 low/moderate/high 各1 advisory；未改依赖或 lockfile                                                                                                     | 记录风险，解除冻结后按真实可达性分级，不能静默 npm audit fix                                      |
| WARNING                 | 本轮恢复验证只在同一 Windows 主机的全新 GitHub clone；未到新 Mac/Windows 实测                                                                                     | 新电脑执行恢复清单，Windows native 安装门禁单独验收                                               |

下一阶段最短路线：先用户核验 GitHub 下载与 SHA；再有限批准/修复确认安装 P1；解决 #19/#20 当前失败与最新代码独立 QA；固定新 RC 做真实双客户端及 Toolbox 验收；保留正式文档/三语/备份/生产授权门禁，满足原门槛后才申请合并/正式发布。不得为迁移强行合并所有 PR。
