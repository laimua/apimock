# Changelog

本项目所有重要变更记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0] - 2026-07-30

本次发布聚焦**安全加固、代码审查整改、架构优化与文档完善**。经过多轮独立代码审查（含多模型交叉评审）并持续修复，项目成熟度显著提升。

### Added
- 种子数据：首次启动自动创建 `demo-project`（含 `/users`、`/users/:id`、`/orders` 端点）
- 限流：Mock 服务 100 req/min/IP，AI generate 10 req/min/IP
- Body 大小守卫：超 1MB 返回 413
- Health endpoint：`/api/health`
- Railway 部署配置：`railway.toml`
- 双数据库索引：`requests(endpoint_id, created_at)` + `responses(endpoint_id)`
- **鉴权系统（G1）**：proxy 中间件 + HMAC cookie 登录，管理面需 MANAGE_TOKEN（#10）
- **端点列表删除入口**：端点列表页可直接删除（#26）
- **可观测性**：OpenTelemetry 自动埋点 + Prometheus metrics（`/api/metrics`）
- **备份**：`POST /api/admin/backup`（SQLite WAL 一致快照）
- 架构审查整改配套测试：`db-error` / `ai-errors` / `db-transaction` 三组单测
- README 截图自动化脚本（`scripts/screenshot-readme.mjs`）

### Changed
- Mock 路由 `recordRequest` 从 `void` 改为 `next/after`，serverless 下保证日志写入
- `db-sqlite.ts` logger 仅 dev 模式开启，生产关闭 SQL 日志
- `generateMockData` 抽到 `src/lib/mock-data-templates.ts`（DRY）
- **AI 错误防泄露**：抽 `handleProviderError` 统一处理，固定对外文案 + 原始错误只进日志（#28）
- **TOCTOU 唯一约束判定统一**：抽 `isUniqueViolation`，MySQL 用错误码、SQLite 消息粗匹配，去列名硬编码（#28）
- **事务工具加固**：`runInTransaction` 加 thenable 守卫，防 better-sqlite3 async 回调静默部分提交（#28）
- `useMysql`/`isMysql` 改惰性求值，消除测试动态切 DB_TYPE 静默用错库（#28）
- 生产构建启用 `output: 'standalone'`，镜像更小（#31）
- CI Node 版本对齐到 22（与 engines 一致）（#32）
- README 全面更新：测试数（696 单元）、项目结构、门禁纪律、代码质量说明、当前 UI 截图（#29 #30）

### Security
- demo-project 不可删除（防恶意清空 demo 站）
- 代码审查修复 P0×1 + P1×19 全修 + P2 绝大部分（见 `docs/CODE-REVIEW-2026-07-25.md`）
- SSRF 防护增强（DNS verify + redirect 缓解）、TRUST_PROXY 开关
- 敏感 header 脱敏扩展、CSP 安全头
- 删死依赖 hono + @hono/zod-validator（#28）

### Removed
- 死代码：`getDb()`（全 src 无调用）、`drizzle/schema.ts` + `drizzle/relations.ts`（introspect 历史产物）（#28）
- 死依赖 hono + @hono/zod-validator（#28）

### 已知局限（非 bug，设计取舍）
- **MySQL 双栈为实验性支持**：无版本化迁移、CI 不跑 MySQL 测试。默认 SQLite 完全可用。
- **better-sqlite3 同步阻塞**：开发/测试场景无碍，非生产级高并发方案。
- **单实例部署**：多实例需配 Redis（限流/缓存一致性）。

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
