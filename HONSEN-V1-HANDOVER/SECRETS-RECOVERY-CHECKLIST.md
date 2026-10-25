# 秘密与敏感文件恢复清单

仓库 etianwang/Honsen-procure 为 PUBLIC。源码/非秘密资产备份到GitHub；敏感资料依用户后续选择，原件保留并单独加密成包供其自行保存微信。真实秘密、数据库、浏览器资料与凭据不明文上传GitHub，包括Draft资产。这里只记录名称、用途、位置类别及恢复步骤，不记录任何真实值。

| 配置/资料                                                                         | 用途                             | 新电脑恢复                                                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| COS_REGION、COS_BUCKET、COS_SECRET_ID、COS_SECRET_KEY、COS_SIGNED_URL_TTL_SECONDS | 服务端签名 URL 和对象权限        | 从腾讯云账户重新配置最小权限；若旧 key 无法安全带走则重新签发并审查旧 key 的撤销，不把 key 写入桌面或聊天                    |
| POSTGRES_URL                                                                      | 生产服务端 PostgreSQL            | 使用独立迁移/运行角色，权限按受审 grant policy；由数据库管理员设置新秘密，受保护 server.env 保存                             |
| TEST_DATABASE_URL、.env.test                                                      | 仅隔离 PostgreSQL 测试           | 从 .env.test.example 重建一次性测试配置；不恢复生产连接用于测试                                                              |
| HONSEN_SYNC_API_BASE_URL                                                          | 桌面 HTTPS API 入口              | 根据已授权部署地址配置；不是 PostgreSQL 地址，不带凭据                                                                       |
| GitHub                                                                            | clone/push/私有 Draft 资产读取   | gh auth login / Codex 重新登录；不复制旧 Token；公开源码 clone 不需 Token，读取 Draft 需要仓库权限                           |
| SSH                                                                               | 用户手动服务器运维               | 新机新建密钥，经服务器管理员登记；未发现主用户 .ssh 目录不能推断服务器无需 SSH；不请求或复制私钥                             |
| Toolbox 发布                                                                      | Release/更新 Manifest/校验       | 保留固定 appId/参数/结果字段，重新认证 GitHub；交接 Draft 不能成为正式更新源                                                 |
| 代码签名                                                                          | Windows Authenticode             | 当前0.1.2安装器 NotSigned；未验证签名证书/服务。若将来签名，证书/硬件 key 独立保护，不导出明文 PFX                           |
| Windows Credential Manager                                                        | 会话 token/离线认证保护          | 新机重新在线登录和密码/CAPTCHA；离线缓存不是跨电脑登录授权。原生 API/权限仍须重验，不复制 credential vault 绕过验证          |
| 本地 SQLite、outbox、附件、安装 UUID                                              | 业务与待同步记录、正式编号唯一性 | 用户选择后按现有备份恢复协议做一致性快照；不能单拷一个活动 WAL 数据库或直接复制完整浏览器目录；恢复/克隆后重审编号 namespace |

以下资料未上传GitHub且原地保留；其中选定配置、原生测试证据和59个SQLite一致性快照已进入本机单独AES-256-GCM加密包，范围见 [敏感包恢复](PRIVATE-RECOVERY.md) 与包内PRIVATE-INVENTORY.json。不能把这项描述当全部runtime目录已完整备份：主目录 .env/.env.test、各工作树被忽略的运行配置与测试 DB/PFX/PEM、%LOCALAPPDATA%\Honsen Program\honsen.procure（发现目录存在）、E:/Honsen-T09A/native-20261024144354、E:/HonsenTaskRuntime（含PGDATA/磁盘镜像/浏览器profile）、历史 QA runtime/log 目录。逐项排除见归档 worktrees.initial.json 的 excluded / ignored 与 BACKUP-PENDING.md。没有删除或修改这些资料。

秘密筛查范围：对封存270个脏源码/文档文件的私钥、GitHub token、腾讯 AKID、AWS key 格式扫描未命中；对 Git 历史差异的这些模式未命中。没有用这一结果声称所有历史无秘密。

历史本地 refs/codex/snapshots 中 0c6720a91c837cac8d0f5a9345ee92ea44fd782d、ea3717705cefe8c65b71e7ac7d41485df09dbc04 包含测试 SQLite/WebView/EXE。25个PEM均为证书而非私钥；4个抽样数据库为fixture-like账户结构，64个非WebView文本未发现已检查的秘密模式。这些提交未被远端 refs 包含，GitHub commit API无法取得；不认定发生生产凭据泄漏。普通源码 bundle 明确不含 refs/codex/snapshots。要保存全部本机 Git 对象，必须另行加密。

未全量审计历史所有 DB、二进制WebView缓存、WSL home 或外部备份；如确认真实key/session曾外泄或测试复用真实密码，需撤销相应会话并轮换对应凭据。本轮不执行删除、撤销或轮换。
