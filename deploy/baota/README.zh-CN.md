# 宝塔 V1 候选包

目标 Ubuntu 24.04、Node.js 24.22.1、PostgreSQL 16.15。此包包含 Linux 原生运行依赖，无生产 Docker 要求。构建使用隔离 Linux 容器。正式上线须完成独立解包 P0 验收。

解压到 `/www/wwwroot/api-pr/v1/`，在宝塔 Node 项目管理器选择 Node.js 24.22.1，工作目录为该目录，启动文件 `apps/server/dist/index.js`。等效命令：

```sh
node --env-file=.env apps/server/dist/index.js
```

将 `.env.example` 复制为 `.env`，只填写运行角色凭据；不得使用数据库所有者作为 API 运行账号。初始化/升级必须使用包内受控 migration-runner（维护角色连接），禁止手工拼接 SQL 或将所有表授予运行账号。Seed 按独立入口的运行时参数执行，禁止提交初始密码。

## 单活动路径

在宝塔现有域名 HTTP 站点添加以下 location；Cloudflare Flexible 回源 HTTP，源站不要强制跳转 HTTPS，否则会形成循环。公网域名仅发布 Cloudflare HTTPS，源站访问限制沿用已批准安全配置。

```nginx
location = /v1 { return 308 /v1/; }
location ^~ /v1/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
location / {
    default_type application/json;
    return 410 '{"code":"client_upgrade_required","message":"请升级客户端后重试"}';
}
```

未来切换前备份配置与数据库并验证恢复，停止 V1 后才启动 V2。将活动 location 改为 `/v2/`，旧 `/v1` 必须进入 410 拒绝，绝不能转发 V2。保留旧目录和原始 ZIP。回退必须先验证旧 API 对当前 migration schema 的兼容性；不兼容需经授权通过已验证宝塔备份恢复。仅复制文件不能回退数据库。

软件版本见 package.json，活动 API 版本为 v1，源码 SHA 见 build-manifest.json；数据库版本以 schema_migrations 实际记录为准。SHA256SUMS 校验包内文件，ZIP 外侧 `.sha256` 校验完整 ZIP。
