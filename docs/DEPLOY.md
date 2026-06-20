# 部署指南 / Deployment Guide

ApiMock 支持多种部署方式。本文档覆盖常见场景。

> 中文版为主。英文部署文档待补。

## 目录

- [Railway（推荐）](#railway推荐)
- [Fly.io](#flyio)
- [本地 Docker](#本地-docker)
- [SQLite 路径](#sqlite-路径默认)
- [MySQL 路径](#mysql-路径可选)
- [环境变量速查](#环境变量速查)
- [升级与回滚](#升级与回滚)

---

## Railway（推荐）

最快路径，~5 分钟上线。

### 步骤

1. **Fork 仓库**：GitHub 上 fork `laimua/apimock` 到自己账号
2. **新建 Railway 项目**：[railway.app](https://railway.app) → New Project → Deploy from GitHub repo → 选你的 fork
3. **配置环境变量**（Railway Dashboard → Variables）：
   ```
   SQLITE_PATH=/data/apimock.db
   ENCRYPTION_KEY=<openssl rand -hex 32 生成的 64 位 hex>
   NODE_ENV=production
   ```
4. **持久卷**：railway.toml 已配置 `/data` 卷，Railway 自动挂载
5. **健康检查**：railway.toml 配置 `/api/health`，60s 超时
6. **首次启动**：自动 seed `demo-project`（含 `/users`、`/users/:id`、`/orders` 端点）

### 验证

部署完成后访问 `https://<your-app>.up.railway.app`：
- `/api/health` 返回 `{ status: 'ok', timestamp: '...' }`
- `/projects` 显示 `demo-project` 卡片
- `curl https://<your-app>.up.railway.app/demo-project/users` 返回用户列表 JSON

### 限流说明

- 单实例（`replicas: 1`）：默认内存后端精确
- 多实例：配 `REDIS_URL` 后自动切 Redis 后端，限流和 AI 预算跨副本共享
  - Mock 服务：100 req/min/IP
  - AI generate：10 req/min/IP
  - AI 日预算：1M tokens / 1000 calls（默认，按 UTC 日）

### 可观测性（可选）

- 结构化日志：`LOG_LEVEL=info`（默认），pino JSON 输出
- Metrics：`/api/metrics`（需 `METRICS_TOKEN`），Prometheus 格式
- 深探活：`/api/health/ready`（DB + 文件系统），Railway readiness probe 接此
- APM / tracing：配 `OTEL_EXPORTER_OTLP_ENDPOINT` 启用 OTel 自动埋点
  - 自动覆盖 http/https/next/better-sqlite3/mysql2/ioredis
  - 鉴权：`OTEL_EXPORTER_OTLP_HEADERS=x-api-key=xxx`
  - 服务名：`OTEL_SERVICE_NAME=apimock`（默认）

### 备份

- WAL 已开（`db-sqlite.ts`），`.backup` 取一致快照
- 触发：`POST /api/admin/backup`（头 `X-Admin-Token: <ADMIN_TOKEN>`）
- 建议外部 cron：Railway cron service / GitHub Actions scheduled / UptimeRobot
- 输出：`./data/backups/apimock-YYYYMMDD-HHmmss.db`，滚动保留 7 份

### 免费额度

Railway 免费层 500 小/月。demo 站常驻会超。建议：
- 升级 Hobby Plan（$5/月起，含 persistent volume）
- 或部署到 Fly.io（免费额度更大）

---

## Fly.io

适合需要多区域 / 更灵活配置的场景。

### 步骤

1. 安装 `flyctl`：`curl -L https://fly.io/install.sh | sh`
2. 登录：`flyctl auth login`
3. 新建 app：`flyctl launch --image node:20`（在 apimock 目录下）
4. 配置 `fly.toml`（参考模板）：
   ```toml
   [http_service]
   internal_port = 3000
   force_https = true
   auto_stop_machines = false  # 保持常驻
   auto_start_machines = true
   
   [[http_service.checks]]
   interval = "30s"
   timeout = "10s"
   grace_period = "60s"
   method = "GET"
   path = "/api/health"
   
   [mount]
   source = "apimock_data"
   destination = "/data"
   ```
5. 创建 volume：`flyctl volumes create apimock_data --region hkg`
6. 设置 secrets：
   ```
   flyctl secrets set SQLITE_PATH=/data/apimock.db
   flyctl secrets set ENCRYPTION_KEY=$(openssl rand -hex 32)
   flyctl secrets set NODE_ENV=production
   ```
7. 部署：`flyctl deploy`

---

## 本地 Docker

适合内网部署 / CI 测试。

### Dockerfile（待补，示例）

```dockerfile
FROM node:20-slim
WORKDIR /app

# 启用 pnpm
RUN corepack enable

# 安装依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 复制源码 + 构建
COPY . .
RUN pnpm build

# 数据卷
VOLUME /data
ENV SQLITE_PATH=/data/apimock.db

EXPOSE 3000
CMD ["pnpm", "start"]
```

### 构建 + 运行

```bash
docker build -t apimock .
docker run -d \
  -p 3000:3000 \
  -v apimock-data:/data \
  -e ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -e NODE_ENV=production \
  --name apimock \
  apimock
```

---

## SQLite 路径（默认）

适用场景：单实例 demo / 个人项目 / 小团队。

**优势**：
- 零外部依赖
- 部署最简单
- 性能足够 100 QPS

**劣势**：
- 不支持多实例（HA）
- 备份需复制文件

**关键配置**：
```
DB_TYPE=sqlite                              # 或省略（默认）
SQLITE_PATH=/data/apimock.db                # 持久卷路径
ENCRYPTION_KEY=<openssl rand -hex 32>
```

---

## MySQL 路径（可选）

适用场景：团队 / 高并发 / 需 HA。

**优势**：
- 多实例共享数据
- 标准备份工具
- 成熟运维生态

**劣势**：
- 需 MySQL 服务（自建或云）
- 配置略复杂

**关键配置**：
```
DB_TYPE=mysql
MYSQL_HOST=<host>
MYSQL_PORT=3306
MYSQL_USER=<user>
MYSQL_PASSWORD=<password>
MYSQL_DATABASE=apimock
ENCRYPTION_KEY=<openssl rand -hex 32>
```

**MySQL 服务选择**：
- **Railway MySQL 插件**（同 VPC，低延迟）
- **PlanetScale**（云，serverless）
- **Supabase**（云，含其他功能）
- **AWS RDS**（企业级）
- **自建 MySQL**（完全可控）

**首次迁移**：
```bash
pnpm db:migrate
# 或 tsx scripts/migrate.ts
```

迁移脚本幂等（重复运行无副作用），MySQL 用 try-catch 处理 `CREATE INDEX IF NOT EXISTS` 不支持的情况。

---

## 环境变量速查

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `ENCRYPTION_KEY` | ✅ | — | AES-256-GCM 密钥，**启动时校验，缺失会报错** |
| `DB_TYPE` | ❌ | `sqlite` | `sqlite` / `mysql` |
| `SQLITE_PATH` | ❌ | `./data/apimock.db` | SQLite 文件路径 |
| `MYSQL_HOST` | ❌ | `localhost` | MySQL 主机 |
| `MYSQL_PORT` | ❌ | `3306` | MySQL 端口 |
| `MYSQL_USER` | ❌ | `root` | MySQL 用户 |
| `MYSQL_PASSWORD` | ❌ | — | MySQL 密码 |
| `MYSQL_DATABASE` | ❌ | `apimock` | MySQL 数据库名 |
| `NODE_ENV` | ❌ | `development` | `production` 关闭 SQL 日志 + 启用 auto-seed |
| `SKIP_SEED` | ❌ | — | `true` 禁用 auto-seed（测试用） |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | ❌ | — | Plausible 域名，留空禁用 analytics |
| `OPENAI_API_KEY` | ❌ | — | OpenAI API key（也可在 `/settings/ai` 页面配置） |

---

## 升级与回滚

### 升级

1. **备份数据库**：
   - SQLite：`cp /data/apimock.db /data/apimock.db.bak`
   - MySQL：`mysqldump apimock > apimock.sql`
2. **拉取新代码**：`git pull origin master`
3. **运行迁移**：`pnpm db:migrate`（幂等）
4. **重启服务**：Railway 会自动，手动 = `flyctl apps restart <app>` 或 `docker restart apimock`

### 回滚

1. **代码回滚**：`git reset --hard <previous-commit>`
2. **数据回滚**（仅当 migration 不可逆时）：
   - SQLite：恢复 `apimock.db.bak`
   - MySQL：`mysql apimock < apimock.sql`
3. **重启服务**

### Migration 兼容性

`scripts/migrate.ts` 全部用 `CREATE TABLE IF NOT EXISTS` 和 `CREATE INDEX IF NOT EXISTS`（SQLite）/ try-catch（MySQL），向后兼容。

降级 migration 不支持——升级前务必备份。
