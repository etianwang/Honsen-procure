# 恢复与核验清单

## 当前已实测（同一 Windows 主机，独立 GitHub clone）

- [x] 全新 clone，无原工作树依赖；checkout f4756afdb01ebac7b17ae9016d9ad56ab450fea5。
- [x] Node 24.18.0，npm ci 成功；lockfile 未变。
- [x] npm run typecheck 成功（desktop/server/shared）。
- [x] npm run test --workspace @honsen/shared：25/25。
- [x] npm run test --workspace @honsen/desktop：16/16。
- [x] 13个封存远端 ref 与本地 archive SHA 一致；270个文件 blob 与初始快照逐字节 SHA256 一致。
- [x] Windows安装器、API包、Manifest、截图和当前Sandbox证据已原样复制并重算摘要；没有覆盖源资产。

## 用户在新电脑执行

- [ ] 读取 [新电脑说明](NEW-COMPUTER-SETUP.md)，安装当前OS工具链。
- [ ] 登录GitHub，下载专用 handover Draft；Draft 的URL/标签以 BACKUP-RECEIPT.md 为准。
- [ ] 在一个新目录解压并执行包内 verify-sha256.cjs；全部摘要通过才继续。
- [ ] GitHub clone、checkout冻结SHA；需要WIP时按 BRANCH-STATUS 的 archive branch另开新目录，不往RC/main套patch。
- [ ] 用 branch/source SHA表确认旧本地分支可以重建；检查WIP冲突标记、index stages和MERGE_HEAD后再决定如何继续。
- [ ] 无网络源码恢复：git clone --branch main source.bundle restored-source，按表checkout；bundle是源代码备份，不包含敏感Codex内部快照。
- [ ] npm ci / types / 对应OS定向tests通过，按原门禁补后续任务检查。
- [ ] 重新登录/签发需要的服务端秘密；敏感资料的恢复方式按用户最终选择；不要向公开仓库写入值。
- [ ] 真正Windows机器验证安装器修复及Credential Manager/注册表/UAC/Toolbox；macOS不可替代。
- [ ] 如果恢复业务数据，先取得用户的数据恢复授权，使用一致性备份和隔离还原校验；确认SQLite/outbox/附件与正式编号策略。

本轮未运行Rust/容器/原生安装/生产部署/全套E2E/新Mac验收：本任务为封存，应用没有新增修改且用户要求停止重复QA。影响：这些旧门禁未关闭，恢复测试PASS不等于上线PASS。没有运行任何数据库迁移。

SHA256SUMS.txt 不包含它自身；zip的外部摘要在 BACKUP-RECEIPT.md。对云端实际下载副本重新计算zip hash，再校验包内逐文件hash。只有完成下载核验与用户确认后，才能考虑后续旧机器处理；本任务不授权任何清理。

完整封存表位于 [交接目录](../HONSEN-V1-HANDOVER/README.md)。
