# 备份收据

交接分支codex/handover-docs-20261025；源码13个封存ref，远端SHA已核对，后续B/C另两个ref见协调补充。应用冻结RC f4756afdb01ebac7b17ae9016d9ad56ab450fea5。

非秘密大型归档将上传同一仓库专用未发布Draft交接Release，标签handover-2026-10-25-backup。正式Release、main、stable更新入口与生产均不更改。GitHub仓库公开，不能在任何资产中附带真实秘密或恢复密钥。

本机普通ZIP：E:/HONSEN-V1-HANDOVER-20261025/HONSEN-V1-HANDOVER-20261025.zip；内部SHA256SUMS.txt覆盖payload全部文件（自身除外）。最终ZIP摘要和实际GitHub下载比对结果以单独上传的SHA256SUMS.txt和最终本文件为准。当前打包/上传/下载核验待完成，不把计划写成PASS。

敏感包及密钥在PRIVATE-RECOVERY指定的本机独立目录，未上传GitHub；用户自行保存微信后需核对密文摘要，并在新电脑认证解密。不包含完整WebView/PGDATA/内部Git快照等，见BACKUP-PENDING。

在用户确认微信实际保存及新机恢复之前，整体交接保持HANDOVER_INCOMPLETE（用户动作/列明的历史资料边界），不建议清空原电脑。

微信精简包为HONSEN-V1-HANDOVER-WECHAT-20261025.zip，仅源码bundle、代码恢复现场、交接说明及校验工具；不含截图、安装器、API发布包、构建缓存或真实秘密。大型资产只需从GitHub专用Draft备份获取，不必发微信。敏感加密包约2MB，恢复密钥单独保管。
