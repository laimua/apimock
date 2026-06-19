# 贡献指南 / Contributing

感谢你对 ApiMock 的兴趣！本文档说明如何参与贡献。

## 🚀 快速开始

```bash
# Fork & clone
git clone https://github.com/<your-username>/apimock.git
cd apimock

# 安装依赖
pnpm install

# 设置环境变量
cp .env.example .env
# 编辑 .env，至少设置 ENCRYPTION_KEY=<强随机串>

# 数据库迁移
pnpm db:migrate

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test              # 单元 + 集成
pnpm exec playwright test  # E2E
```

## 📋 贡献流程

1. **Issue 先行**：先在 [Issues](https://github.com/laimua/apimock/issues) 创建 issue 描述你要解决的问题（bug 或 feature），等维护者确认方向
2. **Fork + 分支**：从 `master` 创建分支，命名规范：
   - `feat/<scope>` — 新功能
   - `fix/<scope>` — bug 修复
   - `docs/<scope>` — 文档
   - `refactor/<scope>` — 重构
   - `test/<scope>` — 测试
3. **写代码**：遵循下方代码规范
4. **测试通过**：所有现有测试 + 新测试都通过
5. **提交 PR**：用 PR 模板描述变更

## 🎯 代码规范

### 技术栈
- **语言**：TypeScript 5.x strict mode
- **框架**：Next.js 16 (App Router)
- **数据库**：Drizzle ORM + better-sqlite3 / mysql2
- **校验**：Zod
- **测试**：Vitest (单元) + Playwright (E2E)

### 规范要点
- 所有公共函数显式声明参数 + 返回类型
- 禁止 `any`，用 `unknown` + 类型守卫
- 不可变更新（spread operator）
- Zod 校验所有外部输入
- 提交前 `pnpm test` 必须全绿
- 不引入 console.log 到生产代码

详细规范见 `.claude/rules/coding-style.md`。

### Commit 格式
```
<type>(<scope>): <subject>

<body>
```

| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | bug 修复 |
| refactor | 重构 |
| docs | 文档 |
| test | 测试 |
| chore | 构建/工具 |
| perf | 性能 |
| ci | CI/CD |

示例：`feat(mock): 加 body size 413 守卫`

## 🧪 测试

### 单元 + 集成测试 (Vitest)
```bash
pnpm test              # 全部
pnpm test path/file    # 单文件
pnpm test:coverage     # 覆盖率
```

### E2E 测试 (Playwright)
```bash
pnpm exec playwright test
pnpm exec playwright test --ui  # UI 模式
```

### TDD 工作流（推荐）
1. 写失败测试 (RED)
2. 写最小实现 (GREEN)
3. 重构 (REFACTOR)
4. 重复

## 🐛 报告 Bug

[创建 issue](https://github.com/laimua/apimock/issues/new?template=bug_report.md)，包含：
- 复现步骤
- 期望行为 vs 实际行为
- 环境（OS、Node 版本、浏览器、apimock 版本）
- 错误日志 / 截图

## 💡 提建议

[创建 issue](https://github.com/laimua/apimock/issues/new?template=feature_request.md) 或在 [Discussions](https://github.com/laimua/apimock/discussions) 发起讨论。

## 📜 行为准则

参与本项目即代表你同意遵守 [Code of Conduct](./CODE_OF_CONDUCT.md)。请在所有交流中保持尊重和友善。

## 📄 License

提交的贡献将在 [MIT License](./LICENSE) 下发布。
