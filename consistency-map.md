# ApiMock 设计文档与代码实现一致性对照表

> 生成时间：2026-06-27
> 用途：作为逐主题校对的唯一依据。每个主题改完后将状态列刷为 ✅。
> 状态图例：✅ 一致 / ⚠️ 待确认偏差 / ❌ 已确认不一致 / ➖ 文档诚实标注待补、非虚假

---

## A. 设计契约清单（来源：D:\software\openclaw\.openclaw\workspace\memory\projects\apimock）

| ID | 契约来源 | 约定内容摘要 | 期望实现位置 |
|----|---------|------------|------------|
| C-ARCH-1 | docs/README.md:82-109 | 项目结构 = monorepo `apps/web + apps/server + packages/` | 仓库根 |
| C-ARCH-2 | docs/README.md:144 | 后端 = Node.js + **Hono** + **PostgreSQL** + Drizzle | package.json / server |
| C-ARCH-3 | docs/README.md:58-62 | 脚本 `pnpm dev:server` / `pnpm dev:client` | package.json scripts |
| C-ARCH-4 | PRD.md:437-462 (§6.1) | 技术栈：Next.js 16 + React 19 + **SQLite (libsql)** + Drizzle + Zod | package.json |
| C-ARCH-5 | PRD.md:454 | 测试 = Playwright **39** 个用例 | e2e/ |
| C-DB-1 | DATABASE.md 全文 | 双栈 sqlite/mysql，5 张表 projects/endpoints/requests/responses/ai_providers | schema-sqlite.ts / schema-mysql.ts |
| C-DB-2 | DATABASE.md:122-148 | `requests` 表（请求记录），保留策略 1000 条/10 分钟 | schema + request-retention.ts |
| C-DB-3 | DATABASE.md:96-120 | `responses` 独立表 + matchRules + priority + isDefault | schema |
| C-DB-4 | DATABASE.md:150-171 | `ai_providers` 表，apiKey AES-256-GCM 加密 | schema + encryption.ts |
| C-DB-5 | PRD.md:465-519 (§6.2) | 数据模型 = `request_logs` 表 + 无 responses 表 + `match_rules DEFAULT '[]'` | （与 C-DB-2/3 冲突）|
| C-API-1 | API.md:8-84 | 完整路由表（无 `/api/v1` 版本前缀） | src/app/api/ |
| C-API-2 | PRD.md:521-574 (§6.3) | API 路径带 `/api/v1` 前缀 + `/api/v1/import/openapi` + `/export` | （与 C-API-1 冲突）|
| C-API-3 | API.md:88-118 | 统一响应 `{success, data}`，分页 `{items,total,page,pageSize}` | 所有路由 |
| C-API-4 | API.md:452-485 (§5) | metrics/backup token 鉴权 + AI 10/min/IP 限流 + 429 文案 | rate-limit + routes |
| C-API-5 | API.md:420-449 (§4) | Mock 路由响应选择逻辑 + CORS + X-Mock-* 头 | [project]/[...path]/route.ts |
| C-AI-1 | AI.md:11-23 | 统一 OpenAI SDK，openai-compatible 模式 | ai generate route |
| C-AI-2 | AI.md:26-124 | 9 个预设 Provider（OpenAI/Claude/DeepSeek/Gemini/通义/GLM/豆包/Kimi/MiniMax）| ai-presets.ts |
| C-AI-3 | AI.md:204-211 | 降级链：providerId → 默认 → env OPENAI_API_KEY → 本地模板 | ai/generate/route.ts |
| C-AI-4 | AI.md:248-263 | 日预算双轴 AI_DAILY_TOKEN_LIMIT / REQUEST_LIMIT，超额降级本地模板 | ai-budget.ts |
| C-AI-5 | AI.md:324-339 (§6) | SSRF 校验 baseUrl + AI 限流 | ssrf.ts + routes |
| C-FE-1 | FRONTEND.md:26-37 | 技术栈版本号（Next 16.1.6 / React 19.2.3 等） | package.json |
| C-FE-2 | FRONTEND.md:96-107 | 8 个页面路由 | src/app/**/page.tsx |
| C-FE-3 | FRONTEND.md:112-141 | 组件清单（8 业务 + 1 布局 + 4 设置 = 13 个） | src/components/ |
| C-FE-4 | FRONTEND.md:174-189 | UI 组件库 9 个（Badge/Breadcrumb/Button/Card/ConfirmDialog/Input/OnboardingModal/Skeleton/Toast）| src/components/ui/ |
| C-FE-5 | FRONTEND.md:200-227 | api-client.ts 统一封装 fetch | src/lib/api-client.ts |
| C-FE-6 | FRONTEND.md:267-297 (§6) | next-themes 主题系统 + dark: 前缀 | layout.tsx + ThemeToggle |
| C-FE-7 | FRONTEND.md:333-354 (§8) | JsonEditor 基于 CodeMirror 6 | JsonEditor.tsx |
| C-TEST-1 | TEST.md:23-38 | E2E 共 11 个文件 119 用例 | e2e/*.spec.ts |
| C-TEST-2 | TEST.md:339-348 | vitest.config include = `src/**/__tests__/**/*.tsx` + `src/**/*.test.ts` | vitest.config.ts |
| C-DEPLOY-1 | DEPLOY.md:30-73 | Railway 部署 + railway.toml 卷 + auto-seed demo-project | railway.toml |
| C-DEPLOY-2 | DEPLOY.md:122-162 | 本地 Docker（标注"待补，示例"） | Dockerfile（诚实声明缺失）|
| C-DEPLOY-3 | DEPLOY.md:83-118 | Fly.io（提供 fly.toml 模板，非仓库文件） | fly.toml（模板） |
| C-DEPLOY-4 | DEPLOY.md:229-253 | 环境变量速查表（ENCRYPTION_KEY 必填等） | 代码 env 读取点 |
| C-DEPLOY-5 | DEPLOY.md:360-413 (CI/CD) | GitHub Actions ci.yml 双 Job + scripts/ci-local.mjs | .github/workflows + scripts |
| C-PRD-1 | PRD.md:127-202 | P0(7)+P1(5)+Phase1(8)+Phase2(9)+Phase3(2)=31 项全部完成 | 全局 |
| C-PRD-2 | PRD.md:745-750 | 变更日志：v1.3 "E2E 扩展至 10 个文件 94 个用例" | （与 C-TEST-1 的 119 冲突，但属版本演进）|

---

## B. 实现现状清单（来源：D:\work\apimock/src + 配置）

| ID | 实现位置 | 实际行为摘要 |
|----|---------|------------|
| I-ARCH | package.json + 仓库结构 | **单仓** Next.js 16.1.6 App Router；无 apps/server；hono 包**已声明但 src/ 零引用**；DB = better-sqlite3 + mysql2 双栈 |
| I-SCRIPT | package.json:8-22 | 有 dev/build/start/test/typecheck/db:*/seed/ci:local；**无 dev:server / dev:client** |
| I-DB | schema-sqlite.ts / schema-mysql.ts | 5 张表与 DATABASE.md 逐字段一致；历史迁移残留 `body_template`（schema 已删并注释） |
| I-RETENTION | request-retention.ts | LEFT JOIN 排名清理，兼容 MySQL 5.7（无 ROW_NUMBER） |
| I-API | src/app/api/**/*.ts (22 文件) + [project]/[...path]/route.ts | 路由表与 API.md **完全吻合**；统一响应格式一致；无 /api/v1 前缀 |
| I-API-GUARD | rate-limit.ts / ssrf.ts / body-size-limit.ts / encryption.ts | 限流仅 mock(100/min)+ai-generate(10/min)；SSRF 仅 test/generate 时校验；body-size 仅 mock + POST endpoints 的 responseBody refine |
| I-MOCK | [project]/[...path]/route.ts | slug 匹配 + TTL 缓存 + 精确/参数路径 + 规则匹配 + 延迟 + 异步记录 + CORS + X-Mock-* |
| I-AI | ai/generate/route.ts + ai-presets.ts + ai-budget.ts + kv-store.ts | 9 预设与 AI.md 一致；降级链与 AI.md 一致；预算双轴一致 |
| I-FE | src/app/**/page.tsx + src/components/ | 8 页面 + 13 业务/设置组件 + 9 UI 组件，与 FRONTEND.md 吻合；JsonEditor 固定 oneDark 主题 |
| I-FE-API | api-client.ts | fetch 封装与 FRONTEND.md §5.1 一致；但 settings/ai 页与 share 页**绕过**它用裸 fetch |
| I-TEST | e2e/*.spec.ts + vitest.config.ts | E2E 实测 119 用例（11 文件）；vitest include = `**/*.test.ts(x)`（比文档的 `src/**` 更宽，覆盖 e2e 外全部） |
| I-DEPLOY | railway.toml + .github/workflows/ci.yml + scripts/ci-local.mjs | Railway/CI/local-CI 齐全；**无 Dockerfile / fly.toml / docker/**（DEPLOY.md 已诚实标注"待补/示例"） |

---

## C. 偏差登记表（逐主题展开，初始状态）

| # | 主题 | 偏差简述 | 涉及契约 | 状态 |
|----|------|---------|---------|------|
| D1 | 架构 | README 描述 monorepo apps/web+server + Hono + PostgreSQL，实现是单仓 Next.js + better-sqlite3/mysql2，hono 零引用 | C-ARCH-1/2/4 | ✅ 改文档(README 技术栈/结构) |
| D2 | 架构 | README 列 `dev:server`/`dev:client` 脚本，package.json 无此二脚本 | C-ARCH-3, I-SCRIPT | ✅ 改文档(README 脚本) |
| D3 | 数据库 | PRD §6.2 数据模型（request_logs 表/无 responses 表/match_rules '[]'）与 DATABASE.md 及 schema 严重冲突 | C-DB-5 vs C-DB-2/3 | ✅ 改文档(PRD §6.2) |
| D4 | API | PRD §6.3 路径带 `/api/v1`，API.md 与实现均无版本前缀；PRD 还有 /export 端点实现缺失 | C-API-2 vs C-API-1/I-API | ✅ 改文档(PRD §6.3) |
| D5 | 测试 | PRD §6.1 称 39 E2E 用例、变更日志称 94，实际 119 | C-ARCH-5, C-PRD-2 vs I-TEST | ✅ 改文档(PRD 总览+变更日志) |
| D6 | 测试 | TEST.md 各文件用例数为旧快照，总数 119 | C-TEST-1 vs I-TEST | ✅ 核实为零不一致（数字本就正确） |
| D7 | 前端 | settings/ai 页与 share 页绕过 api-client 用裸 fetch | C-FE-5 vs I-FE-API | ✅ 改文档(FRONTEND §5 补例外说明) |
| D8 | 前端 | JsonEditor 固定 oneDark，浅色主题下编辑器仍暗色 | C-FE-7 vs I-FE | ✅ 改代码(主题适配) |
| D9 | 安全 | SSRF 仅在 test/generate 时校验，保存 provider 时不校验 | C-AI-5 vs I-API-GUARD | ✅ 改代码(POST/PATCH 加校验) + 改文档(AI §6.1) |
| D10 | 安全 | PUT/PATCH endpoints 无 body-size 校验 | DEPLOY body-size vs I-API-GUARD | ✅ 改代码(refine) + 改文档(DEPLOY 精确化) |
| D11 | 前端 | ProviderList 接收 onSetDefault 但 void 丢弃 | C-AI CRUD vs I-FE | ✅ 改代码(加设默认按钮) |
| D12 | 部署 | Dockerfile / fly.toml / docker/ 缺失 | C-DEPLOY-2/3 vs I-DEPLOY | ➖ 文档已诚实标注"待补/示例"，保留 |
| D13 | 前端 | share 页自定义 showToast 不用全局 ToastProvider | C-FE-5(隐含) vs I-FE | ✅ 改文档(随 D7 一并说明) |

---

## D. 校对进度

- [x] 主题1：数据库层（DATABASE.md vs schema）—— ✅ 完成。仅 #1 改文档（AI.md 加密格式）；DATABASE.md↔schema 零不一致；D3 跨文档冲突归主题7
- [x] 主题2：API 层（API.md vs routes）—— ✅ 完成。API.md↔routes 零不一致；D9 SSRF 改代码 + D10 body-size 改代码（TDD）
- [x] 主题3：前端层（FRONTEND.md vs components）—— ✅ 完成。D8 JsonEditor 主题适配改代码 + D11 ProviderList 设默认按钮改代码；D7/D13 改文档补例外说明
- [x] 主题4：AI 多模型（AI.md vs ai*）—— ✅ 完成。与主题2 D9 合并处理；预设/降级链/预算/指标均一致
- [x] 主题5：测试层（TEST.md vs e2e）—— ✅ 完成。D6 核实为零不一致（TEST.md §0.1 数字本就正确）；D5 归主题7
- [x] 主题6：部署层（DEPLOY.md vs infra）—— ✅ 完成。D1/D2 改 README（技术栈/结构/脚本/DB初始化）；D12 文档已诚实标注保留
- [x] 主题7：PRD 总体（PRD.md 全量）—— ✅ 完成。D3/D4/D5 改文档对齐实现

---

## E. 终局校对结论（2026-06-27）

### 已修复（共 12 项，其中改代码 4 项 / 改文档 8 项）

**改代码（TDD，新增 4 单测，全量 300 单测通过 + typecheck 通过）：**
1. D9 — Provider 保存时 SSRF 校验（POST/PATCH `/api/ai/providers`，安全强化）
2. D10 — PUT/PATCH endpoints responseBody 1MB refine（body-size 对齐 POST）
3. D8 — JsonEditor 跟随 next-themes 切换浅/暗主题
4. D11 — ProviderList 渲染"设为默认"按钮（Star 图标），消费 onSetDefault

**改文档（最小 diff）：**
5. #1 — AI.md §3.3 加密格式 v2（salt:iv:authTag:encrypted）
6. D1/D2 — docs/README.md 技术栈/项目结构/脚本/DB 初始化对齐单仓 Next.js
7. D3 — PRD §6.2 数据模型对齐（requests/responses 表而非 request_logs）
8. D4 — PRD §6.3 API 路径对齐（无 /api/v1 前缀，清理损坏 markdown）
9. D5 — PRD 总览/变更日志 E2E 数字（94→119）+ 版本 v1.3→v1.4
10. D7/D13 — FRONTEND.md §5 补 api-client 例外说明（settings/share 页）
11. D8 文档 — FRONTEND.md §8 JsonEditor 主题适配描述
12. D9/D10 文档 — AI.md §6.1 SSRF 双重校验 + DEPLOY.md body-size 返回码精确化

### 未修复（保留，附理由）

- **D12** — Dockerfile / fly.toml / docker/ 缺失：DEPLOY.md 已诚实标注"待补，示例"，非虚假声明；属待开发项，不属一致性缺陷，保留。

### 验证结果

- `pnpm typecheck`：✅ 通过（0 错误）
- `pnpm test`（单测）：✅ 300/300 通过（原 296 + 新增 4）
- 代码改动均经 TDD（RED → GREEN → 全量回归）

### 剩余风险

1. **E2E 未跑**：本环境无浏览器，`pnpm exec playwright test`（119 用例）未执行。代码改动（D8/D11）影响 UI，建议在本地或 CI 跑一遍 E2E 确认 JsonEditor 主题切换与设默认按钮交互。
2. **手动主流程抽查未做**：dev 服务未起，PRD 关键路径未手动验证。建议 `pnpm dev` 后抽查：创建项目→建端点→Mock 调用→AI 生成→分享。
3. **hono 包残留**：`hono` + `@hono/zod-validator` 在 dependencies 但零引用，可在后续清理（本次未动，避免扩大改动面）。

---

*本文档为活文档，每轮主题校对后更新对应行与状态。*
