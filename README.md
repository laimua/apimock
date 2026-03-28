# ApiMock

AI 智能 Mock 平台 - 通过自然语言生成真实语义的 Mock 数据

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 构建生产版本
pnpm build
```

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # 后端 API
│   │   └── projects/      # 项目管理 API
│   └── [project]/         # Mock 服务路由
│       └── [...path]/     # 动态路径匹配
├── components/            # React 组件
├── hooks/                 # 自定义 Hooks
├── lib/                   # 工具库
│   ├── api.ts            # API 响应工具
│   ├── db.ts             # 数据库配置
│   └── schema.ts         # 数据库 Schema
└── types/                 # TypeScript 类型

## 测试 Mock 服务

```bash
# 获取用户列表
curl http://localhost:3000/demo-project/users

# 获取单个用户
curl http://localhost:3000/demo-project/users/1

# 创建用户
curl -X POST http://localhost:3000/demo-project/users
```

## 文档

- [PRD 文档](../memory/projects/apimock/PRD.md)
- [API 规范](../memory/projects/apimock/docs/API.md)
- [数据库设计](../memory/projects/apimock/docs/DATABASE.md)
- [部署方案](../apimock-ai-solution/docs/DEPLOYMENT.md)
