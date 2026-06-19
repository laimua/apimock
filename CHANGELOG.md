# Changelog

本项目所有重要变更记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 种子数据：首次启动自动创建 `demo-project`（含 `/users`、`/users/:id`、`/orders` 端点）
- 限流：Mock 服务 100 req/min/IP，AI generate 10 req/min/IP
- Body 大小守卫：超 1MB 返回 413
- Health endpoint：`/api/health`
- Railway 部署配置：`railway.toml`
- 双数据库索引：`requests(endpoint_id, created_at)` + `responses(endpoint_id)`

### Changed
- Mock 路由 `recordRequest` 从 `void` 改为 `next/after`，serverless 下保证日志写入
- `db-sqlite.ts` logger 仅 dev 模式开启，生产关闭 SQL 日志
- `generateMockData` 抽到 `src/lib/mock-data-templates.ts`（DRY）

### Security
- demo-project 不可删除（防恶意清空 demo 站）

## [0.1.0] - 2026-03-22

### Added
- AI 智能 Mock 数据生成（多 provider：OpenAI/Claude/DeepSeek/Gemini/通义/智谱/豆包/Moonshot/MiniMax）
- OpenAPI 3.0 导入
- 项目 + 端点 CRUD
- 动态响应规则（Query/Header 匹配）
- 错误场景模拟（超时/500/限流）
- 请求记录查看
- Mock 模板库
- 端点分享（公开链接）
- 暗色模式
- 移动端响应式
- SQLite + MySQL 双数据库支持
- 197 单元测试 + 65+ E2E 测试
