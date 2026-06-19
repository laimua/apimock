# ApiMock

AI 智能 Mock 平台 - 通过自然语言生成真实语义的 Mock 数据，支持 OpenAPI 导入、多模型 AI 生成、错误场景模拟和端点分享。

## ✨ 功能特性

- 🤖 **AI 智能 Mock** — 通过自然语言描述生成真实语义的 Mock 数据，支持 OpenAI、Claude、DeepSeek、Gemini、通义千问、智谱GLM、字节豆包、Moonshot、MiniMax 等多种模型，也支持 Ollama 等本地部署
- 📥 **OpenAPI 导入** — 一键导入 OpenAPI/Swagger 规范，自动创建项目和端点
- 🎭 **错误场景模拟** — 内置多种错误场景（超时、500、限流等），方便前端调试
- 📊 **请求记录** — 实时记录所有 Mock 请求，支持查看请求详情和响应
- 🔗 **端点分享** — 通过公开链接分享 Mock 端点，方便团队协作
- 📝 **模板库** — 预置常用 API 模板，快速创建 Mock 端点
- 🌙 **暗色模式** — 支持亮色/暗色主题切换

## 🛠 技术栈

| 技术 | 用途 |
|------|------|
| [Next.js 16](https://nextjs.org/) | React 全栈框架 (App Router) |
| [Drizzle ORM](https://orm.drizzle.team/) | 类型安全的数据库 ORM |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite 驱动（默认） |
| [mysql2](https://github.com/sidorares/node-mysql2) | MySQL 驱动（可选） |
| [Zod](https://zod.dev/) | API 参数校验 |
| [Vitest](https://vitest.dev/) | 单元测试框架 |
| [Playwright](https://playwright.dev/) | E2E 测试框架 |
| [CodeMirror](https://codemirror.net/) | JSON 编辑器 |
| [Tailwind CSS v4](https://tailwindcss.com/) | UI 样式 |

## 快速开始

```bash
# 安装依赖
pnpm install

# 数据库迁移
pnpm db:migrate

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 运行 E2E 测试
pnpm exec playwright test

# 构建生产版本
pnpm build
```

## 项目结构

```
src/
├── app/
│   ├── api/                          # 后端 API
│   │   ├── ai/                       # AI 相关 (生成、供应商管理)
│   │   ├── projects/                 # 项目 CRUD、导入、Slug 检查
│   │   │   └── [id]/
│   │   │       ├── endpoints/        # 端点 CRUD
│   │   │       │   └── [endpointId]/
│   │   │       │       ├── requests/ # 请求记录
│   │   │       │       └── responses/# 响应规则
│   │   │       └── import/           # OpenAPI 导入
│   │   └── share/                    # 分享链接
│   ├── projects/                     # 项目管理页面
│   ├── settings/                     # AI 设置页面
│   ├── share/                        # 分享页面
│   └── [project]/[...path]/          # Mock 服务动态路由
├── components/
│   ├── layout/                       # Header、Sidebar
│   ├── settings/                     # AI 供应商管理组件
│   └── ui/                           # 通用 UI 组件
└── lib/
    ├── db.ts                         # 数据库驱动选择（sqlite/mysql）
    ├── db-sqlite.ts                  # SQLite 驱动配置
    ├── db-mysql.ts                   # MySQL 驱动配置
    ├── schema.ts                     # Schema 导出
    ├── schema-sqlite.ts              # SQLite Drizzle Schema
    ├── schema-mysql.ts               # MySQL Drizzle Schema
    ├── encryption.ts                 # API Key 加密（AES-256-GCM + 随机 salt）
    ├── ssrf.ts                       # SSRF 防护（URL 安全校验）
    ├── constants.ts                  # HTTP 方法、状态码常量
    ├── hooks.ts                      # React hooks (useDebounce)
    ├── api.ts                        # API 响应工具函数
    ├── api-client.ts                 # 前端 API 客户端
    ├── ai-presets.ts                 # AI 预设模型配置
    ├── openapi-parser.ts             # OpenAPI 解析器
    ├── error-scenarios.ts            # 错误场景定义
    ├── mock-templates.ts             # Mock 模板
    └── utils.ts                      # 通用工具函数
```

## 测试

项目包含两层测试：

```bash
# 单元测试 (Vitest) - 283 个用例
pnpm test

# E2E 测试 (Playwright) - 115+ 个用例
pnpm exec playwright test
```

## 测试 Mock 服务

```bash
# 获取用户列表
curl http://localhost:3000/demo-project/users

# 获取单个用户
curl http://localhost:3000/demo-project/users/1

# 创建用户
curl -X POST http://localhost:3000/demo-project/users
```

## AI 模型配置

项目支持多 AI Provider 管理，两种配置方式：

1. **页面配置**（推荐）：访问 `/settings/ai` 添加和管理 AI 供应商
2. **环境变量**：设置 `OPENAI_API_KEY` 即可使用

支持的供应商：OpenAI、Claude、DeepSeek、Google Gemini、通义千问、智谱GLM、字节豆包、Moonshot Kimi、MiniMax，以及所有 OpenAI 兼容接口（Ollama、vLLM、LM Studio 等）。

## 环境变量

参考 `.env.example` 文件配置：

**数据库配置：**
- `DB_TYPE` — 数据库类型：`sqlite`（默认）或 `mysql`
- `SQLITE_PATH` — SQLite 数据库路径（默认 `./data/apimock.db`）
- `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` — MySQL 连接参数

**安全配置（必填）：**
- `ENCRYPTION_KEY` — API Key 加密密钥，**启动时必须设置**，缺失会报错

## License

MIT
