# 未备份与未验证边界

用户先要求全部备份到GitHub，随后指定保留敏感原件、打包自行保存微信。非秘密内容上传专用Draft交接Release；仓库公开，Draft不会发布为正式版。真实秘密和业务资料原件保留；已另做本机加密包及独立恢复密钥，供用户自行保存微信，尚待用户确认已保存及能恢复。

未上传GitHub内容（其中部分已进入单独加密包，仍需用户实际离机保存）：各工作树.env及被忽略数据库、PFX/私钥/测试证书、浏览器profile；真实应用数据根 %LOCALAPPDATA%\Honsen Program\honsen.procure；E:/HonsenTaskRuntime的PGDATA/测试磁盘镜像/profile；E:/Honsen-T09A/native-20261024144354等未经完整脱敏的runtime目录；本地refs/codex/snapshots和reflog/不可达对象。原始完整Git目录不是普通source.bundle的一部分。源码缺失删除通过patch/状态记录保留，未传播成WIP代码删除。

E:/Honsen-PR17-Independent-P1-runtime、E:/Honsen-PR17-Sync-P1-runtime、E:/Project/honsen-accepted-fix2-g2-integration-artifacts、E:/Project/honsen-g2-formal-pull-artifacts、E:/Project/honsen-g2-independent-qa-artifacts和旧Playwright runtime资料需先脱敏；已提交报告仍可从GitHub获取。编译缓存/node_modules/cargo-target可重建，不是源码恢复前提，不删除。

未做：另一台Mac/Windows实测、生产库备份恢复、Windows安装器修复验收、全部历史秘密审计。最初47工作树扫描及额外E盘浅层检查有界，并非全盘/所有WSL home取证。不要把本机副本或GitHub上传成功写成用户业务数据已恢复。
