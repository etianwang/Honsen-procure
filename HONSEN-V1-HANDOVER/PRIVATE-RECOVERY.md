# 敏感包与微信保存

用户已选择“保留原件，打包我微信保存”。原文件没有删除、覆盖或上传GitHub。已在内存ZIP中收集选定配置/原生证据并使用AES-256-GCM加密；没有生成普通明文敏感ZIP。

- 本机密文：C:/Users/This PC/Documents/Honsen-Private-Recovery-20261025/HONSEN-PRIVATE-20261025.aesgcm
- 本机独立恢复密钥：同目录RECOVERY-KEY.txt。密钥内容不出现在聊天、Git、普通ZIP或GitHub Draft。
- 共865个文件；59个SQLite采用只读连接online backup到内存、quick_check，再序列化进包。配置/日志/PFX/证书按原bytes保留；索引在加密包内PRIVATE-INVENTORY.json，包含原位置和逐项hash。
- 密文SHA256：ce440b3676677d7a7daea5b32f067a425fcae1f8ecafb641aae52e36722ba574。
- 加密roundtrip、篡改拒绝、865个解密条目摘要校验PASS；另由Node标准crypto独立认证解密核对ZIP摘要PASS。

先把密文文件保存到你自己的微信/受控文件存储，再把RECOVERY-KEY.txt单独安全保存。失去密钥无法解密；不要将密钥上传公开仓库，也不要把明文配置发群聊。助手没有代发任何微信消息，也不能确认微信已接收；这一步仍需用户实测。

新电脑安装Node24后，使用普通交接包内decrypt-private-backup.cjs：

```sh
node decrypt-private-backup.cjs HONSEN-PRIVATE-20261025.aesgcm RECOVERY-KEY.txt --verify
node decrypt-private-backup.cjs HONSEN-PRIVATE-20261025.aesgcm RECOVERY-KEY.txt private-restored.zip
```

命令不会覆盖现有输出；必须先认证成功才写明文ZIP。解压到私人空目录，按PRIVATE-INVENTORY的source映射手动迁移配置，不照搬原电脑绝对路径。SQLite快照通过完整性不代表已完成业务恢复；先隔离还原核对outbox/附件/installation UUID和原安全规则，再由用户批准接入。Windows Credential Manager不随数据库复制，必须新机在线重新认证。

不包括：Windows凭据库、完整WebView profile/缓存、E:/HonsenTaskRuntime大镜像与PGDATA、完整本地refs/codex/snapshots/reflog、所有WSL home。原始敏感配置/数据库仍在原位保留，不能据此清理电脑。
