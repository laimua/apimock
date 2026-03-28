# ApiMock

AI 智能 Mock 平台 - 通过自然语言生成真实语义的 Mock 数据，支持 OpenAPI 导入、多模型 AI 生成、错误场景模拟和端点分享。

## ✨ 功能特性

- 🤖 **AI 智能 Mock** — 通过自然语言描述生成真实语义的 Mock 数据，支持多种 AI 模型（OpenAI、Claude、Gemini 等）
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
| [LibSQL](https://libsql.org/) | SQLite 兼容数据库 |
| [Vitest](https://vitest.dev/) | 单元测试框架 |
| [Playwright](https://playwright.dev/) | E2E 测试框架 |
| [Hono](https://hono.dev/) | 路由参数验证 |
| [CodeMirror](https://codemirror.net/) | JSON 编辑器 |
| [Tailwind CSS](https://tailwindcss.com/) | UI 样式 |

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
    ├── db.ts                         # 数据库配置
    ├── schema.ts                     # Drizzle Schema
    ├── encryption.ts                 # API Key 加密
    ├── openapi-parser.ts             # OpenAPI 解析器
    ├── error-scenarios.ts            # 错误场景定义
    └── mock-templates.ts             # Mock 模板
```

## 测试

项目包含两层测试：

```bash
# 单元测试 (Vitest) - 197 个用例
pnpm test

# E2E 测试 (Playwright) - 39+ 个用例
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

## 环境变量

参考 `.env.example` 文件配置：

- `DATABASE_URL` — LibSQL 数据库连接地址
- `ENCRYPTION_KEY` — API Key 加密密钥（32 字符）

## License

MIT
