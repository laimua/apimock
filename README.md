# ApiMock

[English](./README.en.md) | 简体中文

> 一句话描述 API 需求，30 秒拿到可分享的 Mock URL。AI 自动生成符合语义的响应数据，无需注册、开箱即用。

[![Live Demo](https://img.shields.io/badge/Live%20Demo-🚀%20Try%20Now-blue?style=for-the-badge)](https://apimock.up.railway.app)　[![GitHub stars](https://img.shields.io/github/stars/laimua/apimock?style=for-the-badge)](https://github.com/laimua/apimock)　[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](./LICENSE)

<!-- TODO: 部署到 Railway 后，将上方 Live Demo URL 替换为你的实际 Railway app URL（默认 `<random-words>-<num>.up.railway.app`）或绑定自定义域名 -->

![ApiMock Desktop](./screenshot-desktop.png)

![Mobile + Endpoint Detail](./screenshot-mobile.png)　![New Endpoint Form](./screenshot-new-endpoint.png)

---

## 这是什么

ApiMock 是一个自托管、零配置的 Mock API 服务，专为前后端并行开发设计。

- **AI 智能 Mock** — 用自然语言（中/英）描述需求，AI 生成符合业务语义的 Mock 数据
- **OpenAPI 导入** — 一键导入 OpenAPI 3.0 规范，自动创建端点
- **动态响应规则** — 根据 Query / Header 返回不同响应，模拟异常场景
- **即时分享** — Mock 端点生成公开 URL，团队成员无需登录即可访问
- **多 Provider 支持** — OpenAI、Claude、DeepSeek、Gemini、通义、智谱、豆包、Moonshot、MiniMax，以及所有 OpenAI 兼容接口（Ollama / vLLM / LM Studio）
- **零配置启动** — 首次启动自动 seed `demo-project`，30 秒看到效果

## 快速开始

```bash
git clone https://github.com/laimua/apimock.git
cd apimock
pnpm install

# 必填：生成加密密钥（用于加密 AI provider API key）
export ENCRYPTION_KEY=$(openssl rand -hex 32)

pnpm db:migrate   # 创建表结构
pnpm dev          # 启动 dev server
```

打开 [http://localhost:3000](http://localhost:3000)，首屏会有自动创建的 `demo-project`。

试一下 demo：

```bash
# 获取用户列表
curl http://localhost:3000/demo-project/users

# 获取单个用户
curl http://localhost:3000/demo-project/users/1

# 获取订单列表
curl http://localhost:3000/demo-project/orders
```

## 技术栈

| 技术 | 用途 |
|------|------|
| [Next.js 16](https://nextjs.org/) | React 全栈框架 (App Router) |
| [Drizzle ORM](https://orm.drizzle.team/) | 类型安全的 ORM |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) / [mysql2](https://github.com/sidorares/node-mysql2) | 双数据库支持 |
| [Zod](https://zod.dev/) | API 参数校验 |
| [Vitest](https://vitest.dev/) / [Playwright](https://playwright.dev/) | 296 单元 + 119 E2E 测试 |
| [CodeMirror 6](https://codemirror.net/) | JSON 编辑器 |
| [Tailwind CSS v4](https://tailwindcss.com/) | UI 样式 |

## 部署

### Railway (推荐)

```bash
# 1. Fork 仓库到你的 GitHub
# 2. 在 railway.app 新建项目，连接 GitHub 仓库
# 3. 设置环境变量：
#    SQLITE_PATH=/data/apimock.db
#    ENCRYPTION_KEY=<openssl rand -hex 32>
# 4. Railway 自动构建 + 部署
```

完整部署文档（含 MySQL 路径、Fly.io、本地 Docker）见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

## AI 模型配置

两种方式（任选其一）：

1. **页面配置（推荐）**：访问 `/settings/ai`，添加 provider + API key
2. **环境变量**：设 `OPENAI_API_KEY` 即可使用 OpenAI

API key 用 AES-256-GCM 加密存储（每条带独立 salt）。

## 项目结构

```
src/
├── app/
│   ├── api/                 # 后端 API
│   │   ├── ai/              # AI 生成 + provider 管理
│   │   ├── projects/        # 项目 + 端点 CRUD + OpenAPI 导入
│   │   ├── share/           # 分享链接
│   │   └── health/          # 健康检查
│   ├── projects/            # 项目管理页面
│   ├── settings/            # AI 设置页面
│   ├── share/               # 分享页面
│   └── [project]/[...path]/ # Mock 服务动态路由
├── components/              # React 组件
└── lib/
    ├── db.ts                # DB 驱动选择（sqlite/mysql）
    ├── db-sqlite.ts         # SQLite 驱动
    ├── db-mysql.ts          # MySQL 驱动
    ├── schema-sqlite.ts     # SQLite Drizzle schema
    ├── schema-mysql.ts      # MySQL Drizzle schema
    ├── rate-limit.ts        # 内存限流（token bucket + setInterval）
    ├── body-size-limit.ts   # 1MB body 守卫
    ├── demo-seed.ts         # auto-seed demo-project
    ├── mock-data-templates.ts # 默认 mock 数据模板
    ├── encryption.ts        # AES-256-GCM 加密
    ├── ssrf.ts              # SSRF 防护
    └── analytics.ts         # Plausible 自定义事件
```

## 测试

```bash
pnpm test                      # 单元 + 集成（296 用例）
pnpm exec playwright test      # E2E（119 用例）
pnpm test:coverage             # 覆盖率报告
pnpm ci:local                  # 本地复现 CI（install → build → playwright）
```

## 运维

- **健康检查**：`/api/health`（liveness）+ `/api/health/ready`（DB + 文件系统深探）
- **Metrics**：`/api/metrics`（Prometheus 格式，需 `METRICS_TOKEN`）
- **备份**：`POST /api/admin/backup`（SQLite WAL 一致快照，需 `ADMIN_TOKEN`）
- **APM**：配 `OTEL_EXPORTER_OTLP_ENDPOINT` 启用 OpenTelemetry 自动埋点

完整运维配置见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

## 环境变量

完整列表见 [.env.example](./.env.example)。关键变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `ENCRYPTION_KEY` | 是 | AES-256-GCM 密钥，`openssl rand -hex 32` 生成 |
| `DB_TYPE` | 否 | `sqlite`（默认）或 `mysql` |
| `SQLITE_PATH` | 否 | SQLite 文件路径，默认 `./data/apimock.db` |
| `MYSQL_*` | 否 | MySQL 连接参数（`DB_TYPE=mysql` 时使用） |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | 否 | Plausible analytics 域名，留空禁用 |
| `SKIP_SEED` | 否 | `true` 禁用 auto-seed（测试用） |

## 贡献

欢迎贡献！请先读 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [行为准则](./CODE_OF_CONDUCT.md)。

[创建 bug 报告](https://github.com/laimua/apimock/issues/new?template=bug_report.md) · [提建议](https://github.com/laimua/apimock/issues/new?template=feature_request.md) · [参与讨论](https://github.com/laimua/apimock/discussions)

## License

[MIT](./LICENSE) © 2026 laimua
