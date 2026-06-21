# ApiMock 功能说明

> 本文档基于源码梳理 ApiMock 已实现的主要功能及其实现机制，作为功能索引与架构速查。
> 最后更新：2026-06-21

ApiMock 是一个自托管、零配置的 Mock API 服务，面向前后端并行开发场景。核心价值：一句话描述需求即拿到可分享的 Mock URL，AI 自动生成符合语义的响应数据，开箱即用。

---

## 一、核心功能

### 1. Mock 服务（动态路由匹配）

这是整个项目的基础能力。任意对 `/{project-slug}/{path}` 的请求都会进入 Mock 服务，由 `src/app/[project]/[...path]/route.ts` 统一处理。

实现要点：

- **全 HTTP 方法支持**：导出了 `GET / POST / PUT / DELETE / PATCH / HEAD / OPTIONS` 七个方法处理器，共用一个 `handleMock` 逻辑。
- **两级路径匹配**：先精确匹配（`e.path === requestPath`），未命中再做参数路径模糊匹配。参数路径用 `:param` 语法（如 `/users/:id`），匹配时按 `/` 分段比较，以 `:` 开头的段视为通配。
- **响应来源优先级**：单端点可配置多条 `responses` 记录，匹配顺序为「带 matchRules 且命中 > isDefault > 无规则兜底 > 端点级 `responseBody`」。优先级按 `responses.priority` 降序排列。
- **延迟模拟**：每个端点可设 `delayMs`，命中后 `setTimeout` 阻塞，用于测客户端超时处理。
- **CORS**：所有 Mock 响应带 `Access-Control-Allow-Origin: *`，`OPTIONS` 直接返回 204 预检头。
- **响应头注入**：响应自动带 `X-Mock-Server / X-Mock-Project / X-Mock-Endpoint` 标识头，并合并端点自定义头（过滤 `access-control-*` 防覆盖安全策略）。
- **热路径缓存**：`project-slug → project`（TTL 60s）和 `project+method → endpoints` 两级缓存，避免每次请求扫全表。

### 2. AI 智能 Mock 数据生成

入口 `src/app/api/ai/generate/route.ts`。用户用自然语言（中/英）描述需求，AI 生成符合业务语义的 JSON 数据。

调用链与降级策略（按优先级）：

1. **指定 Provider**：请求带 `providerId` 时优先用该 Provider 调用。
2. **默认 Provider**：查 `isDefault = 1` 的 Provider。
3. **环境变量**：`OPENAI_API_KEY` 直接调用 OpenAI（模型走 `OPENAI_FALLBACK_MODEL`，默认 `gpt-4o-mini`）。
4. **本地模板兜底**：以上都不可用时调用 `generateMockData`（`src/lib/mock-data-templates.ts`），按 prompt 关键词匹配用户/商品/订单/通用模板，保证任何配置下都能返回数据。

系统 Prompt 内置字段类型映射规则（id→递增整数、姓名→中文姓名、邮箱→`{name}{n}@example.com`、电话→`138xxxx`、头像→dicebear URL、时间→ISO 8601 等），并约束输出为 `{code, message, data:{list, total}}` 结构。

对 AI 返回的容错解析：先直接 `JSON.parse`，失败则提取 ```` ```json ``` ```` 代码块，再失败提取最外层 `{}`。任一成功即用。

成本控制见 [安全机制](#六安全机制) 中的 AI 预算部分。

### 3. AI 多 Provider 管理

`ai-presets.ts` 预置了 9 家服务商，均通过 OpenAI 兼容接口接入：

- 原生：OpenAI、Anthropic Claude
- OpenAI 兼容：DeepSeek、Google Gemini、阿里通义千问、智谱 GLM、字节豆包、Moonshot Kimi、MiniMax
- 同时支持 Ollama / vLLM / LM Studio 等本地推理服务（任意 OpenAI 兼容 baseUrl）

Provider 的 API Key 用 AES-256-GCM 加密存储（见 [安全机制](#六安全机制)）。设置页 `/settings/ai` 提供：新增 Provider、连接测试（`/api/ai/providers/[id]/test`）、设默认、模型管理、自定义 System Prompt。前端组件含 `AddProviderDialog`、`PresetProviders`、`ProviderList`、`TestConnectionButton`。

### 4. OpenAPI 3.0 导入

解析器 `openapi-parser.ts`，导入入口 `api/projects/[id]/import/route.ts`。

能力：

- **格式自动识别**：`detectFormat` 按首字符判断 JSON 还是 YAML（支持上传 `.yaml` / `.yml` / `.json`）。
- **`$ref` 递归解析**：`resolveRefs` 深度遍历文档，解析 `#/components/schemas/...` 等内部引用，未找到时保留原 `$ref` 不报错。
- **端点提取**：遍历 `paths` 下所有 HTTP method（含 `trace`），从 `operation.responses` 抽取状态码与 schema，`summary` / `operationId` 作为端点名。
- **批量入库 + 去重**：一次预查项目下已有端点构造 `method path` Set，跳过重复；新端点与对应 responses 收集后批量 `insert`（减少 N+M 次查询为 2 次），完成后失效端点缓存。
- **两步导入**：`/import/parse` 仅解析预览不入库，`/import` 执行实际导入。

### 5. 动态响应规则

让同一端点根据请求返回不同响应，用于模拟异常场景或分支逻辑。后端匹配逻辑在 `route.ts` 的 `matchRule`，前端编辑器 `ResponseRuleEditor.tsx`（728 行）。

每条 response 记录的 `matchRules` 支持：

- **Query 匹配**：`?key=value` 全部相等才命中。
- **Header 匹配**：header 名大小写不敏感比较。
- **优先级与默认**：`priority` 数值越大越优先；`isDefault` 标记兜底响应。

匹配优先级：规则命中 → 默认响应 → 端点级 `responseBody`。

### 6. 错误场景模拟

`error-scenarios.ts` 预置 12 种错误场景，按 4 类分组，一键应用到端点。前端选择器 `ErrorScenariosSelector.tsx`。

- **服务器错误**：500 / 502 / 503（带 `Retry-After`）/ 504
- **客户端错误**：400 / 401（带 `WWW-Authenticate`）/ 403 / 404
- **超时**：408 + 30s 延迟
- **网络错误**：空响应、格式错误的 JSON、网络错误（503 + `Connection: close`）

每种场景含标准化的错误响应体（code / message / details 结构），`applyErrorScenario` 直接产出 `statusCode / contentType / delayMs / responseBody` 填入表单。

### 7. Mock 模板库

`mock-templates.ts`（768 行）维护常用响应模板，按分类组织（用户、商品、分页等）。前端 `TemplateLibraryDialog.tsx` 提供一键应用，把模板内容填入 JSON 编辑器，省去手写响应体。

### 8. 请求记录与留存

每次 Mock 请求（含未命中的 404）异步写入 `requests` 表。字段含 method、path、query、headers、body、responseStatus、responseTime、ip、userAgent、createdAt。要点：

- **异步不阻塞响应**：用 Next.js `after()` 在响应返回后写入，保证 serverless 环境下日志不丢。
- **敏感头脱敏**：`sanitizeHeaders` 对 `authorization / cookie / set-cookie / x-api-key` 统一打码为 `[REDACTED]`。
- **IP 防伪造**：`getClientIp` 优先取 `X-Real-IP`，否则取 `X-Forwarded-For` 链尾。
- **自动留存清理**：`request-retention.ts` 定期裁剪旧记录，`pruneDeletedTotal` 指标统计删除量。

前端查看页 `RequestRecords.tsx`。

### 9. 端点分享（公开链接）

项目生成可分享的只读公开页 `/{slug}` 及 API `/api/share/{slug}`。任何人无需登录即可访问，返回项目信息、端点列表（含 method / path / 状态码 / 响应体）与拼好的 baseUrl，便于团队成员对接。分享页与数据接口只返回公开字段，不含敏感信息。

---

## 二、项目管理

项目（project）是端点的容器，slug 作为 Mock URL 前缀（`/{slug}/{path}`）。

- **CRUD**：`api/projects/route.ts`（列表/创建）、`api/projects/[id]/route.ts`（详情/更新/删除）。
- **端点 CRUD**：`api/projects/[id]/endpoints/route.ts` 等，支持 GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS 七方法，路径参数（`:param`），标签分类，自定义状态码 / Content-Type / 延迟。
- **Slug 校验**：`api/projects/check-slug/route.ts` 校验 slug 唯一性与合法性。
- **设置**：项目级 `settings`（JSON）、`basePath`、`isActive` 开关。

前端页面：项目列表、新建项目、项目详情、端点列表、新建/编辑端点（含 CodeMirror 6 JSON 编辑器 `JsonEditor.tsx`）。

---

## 三、零配置启动（auto-seed）

`demo-seed.ts` 在首次启动时自动创建 `demo-project`，含 `/users`、`/users/:id`、`/orders` 等端点，30 秒内即可看到效果。`demo-project` 标记为不可删除，防止恶意清空演示站。可用环境变量 `SKIP_SEED=true` 禁用（测试场景）。

---

## 四、数据模型

Drizzle ORM 双 schema：`schema-sqlite.ts` 与 `schema-mysql.ts`，运行时按 `DB_TYPE` 切换。五张核心表：

- `projects` — 项目（id / name / slug 唯一 / description / basePath / isActive / settings）
- `endpoints` — 端点（projectId 外键级联删除 / path / method enum / delayMs / statusCode / contentType / responseBody / tags），`projectId + method + path` 唯一索引
- `responses` — 响应规则（endpointId / statusCode / headers / body / matchRules / isDefault / priority），带 `endpointId` 索引
- `requests` — 请求记录（endpointId / method / path / query / headers / body / responseStatus / responseTime / ip / userAgent），带 `endpointId` 与 `createdAt` 双索引
- `aiProviders` — AI 服务商配置（name / provider enum / baseUrl / apiKey 加密 / models JSON / defaultModel / systemPrompt / isActive / isDefault）

表间通过 Drizzle `relations` 定义一对多关系（project→endpoints，endpoint→responses/requests）。

---

## 五、运维与可观测性

### 健康检查

- **Liveness**：`GET /api/health` → `200 { status: 'ok' }`，进程存活即通，供 Railway healthcheck / uptime 监控。
- **Readiness**：`GET /api/health/ready` → 深探 DB 可查（`select 1`）+ 数据目录可写（SQLite 模式才探 fs），任一失败返 503 并带原因。用于 K8s / Railway readiness probe，失败剔除负载均衡但不重启。

### Prometheus 指标

`GET /api/metrics` 输出 prom-client 默认指标 + 自定义业务指标，需 `Authorization: Bearer <METRICS_TOKEN>`（或 `?token=`）。未配 token 时返 503 禁用端点，避免无鉴权暴露。指标清单（`metrics.ts`）：

- `apimock_mock_requests_total{method,status}` — Mock 请求计数（故意不带 project label，防 Prometheus 基数爆炸）
- `apimock_mock_request_duration_ms{method}` — 请求耗时直方图（P50/P95/P99）
- `apimock_ai_generate_total{provider,outcome}` — AI 生成计数（outcome: provider/fallback/budget）
- `apimock_ai_cost_tokens_total{provider}` — AI token 消耗
- `apimock_ai_budget_remaining{axis}` — AI 日预算剩余（tokens/requests gauge）
- `apimock_rate_limit_rejected_total{kind}` — 限流拒绝计数
- `apimock_prune_deleted_total` — 请求记录清理计数

### SQLite 备份

`POST /api/admin/backup`（需 `X-Admin-Token`）触发 WAL 模式一致快照备份，输出 `./data/backups/apimock-YYYYMMDD-HHmmss.db`，滚动保留默认 7 份。设计为外部触发（Railway cron / GitHub Actions / UptimeRobot），不在进程内 `setInterval`，避免重启漏跑与阻塞 event loop。`GET` 查询状态。

### OpenTelemetry APM

配 `OTEL_EXPORTER_OTLP_ENDPOINT` 即启用 `otel.ts` 自动埋点，覆盖 http/https、Next.js、better-sqlite3/mysql2/ioredis、undici。未配置时 SDK 不启动、零开销。服务名默认 `apimock`，支持 SIGTERM 优雅关闭。

### 日志

pino 结构化日志，`pino-pretty` 美化开发输出。

---

## 六、安全机制

### API Key 加密

`encryption.ts` 用 AES-256-GCM 加密存储所有 Provider API Key。

- v2 格式：`salt:iv:authTag:encrypted`，每条带随机 16 字节 salt。
- v1 格式兼容：`iv:authTag:encrypted`（静态 salt），自动识别旧数据解密。
- 密钥派生用 `scryptSync`，派生结果按 `(secret, salt)` 缓存，把后续解密从几十 ms 降到约 0ms。
- 前端显示用 `maskApiKey` 打码（`sk-***...***xxx`）。
- `ENCRYPTION_KEY` 必填，缺失时启动直接报错。

### SSRF 防护

`ssrf.ts` 在 AI Provider 调用前校验 `baseUrl`，拦截私有 IP 段（10/8、172.16/12、192.168/16、127/8、169.254/16、0/8）、IPv6 loopback、IPv4-mapped IPv6，以及 `localhost` / `metadata.google.internal` 等危险主机名，只允许 http/https。

### 限流

`rate-limit.ts` 基于固定窗口计数器，后端由 KV 抽象层决定（无 `REDIS_URL` 走进程内 Memory，有则走 Redis 原子 `INCR` + `EXPIRE`）。

- Mock 服务：100 req/min/IP
- AI 生成：10 req/min/IP（成本控制）

超限返 429 并带 `X-RateLimit-*` 头。

### AI 成本预算

`ai-budget.ts` 按每日全局双轴硬上限兜底，防恶意脚本轮换 IP 绕过 per-IP 限流。

- `AI_DAILY_TOKEN_LIMIT`（默认 100 万）/ `AI_DAILY_REQUEST_LIMIT`（默认 1000）。
- 超额直接降级到本地 mock 模板，不消耗任何 token。

### Body 大小守卫

`body-size-limit.ts` 限制请求体 1MB。先用 `content-length` 快速路径判断避免全量读取，JSON 请求再二次校验实际字节。

### 其他

- demo-project 不可删除（防恶意清空）。
- 敏感响应头脱敏记录。
- Metrics / Backup 端点默认拒绝，未配 token 返 503。

---

## 七、技术架构

| 层 | 技术选型 |
|---|---|
| 框架 | Next.js 16（App Router，React 19） |
| 路由处理 | Hono |
| ORM | Drizzle ORM（类型安全，双 schema） |
| 数据库 | better-sqlite3 / mysql2（双驱动，`DB_TYPE` 切换） |
| 校验 | Zod |
| KV 抽象 | Memory / ioredis 双后端（`kv-store.ts`） |
| UI | Tailwind CSS v4 + Lucide React |
| 编辑器 | CodeMirror 6（JSON 语法 + one-dark 主题） |
| AI SDK | openai（兼容多家） |
| 日志 | pino + pino-pretty |
| 指标 | prom-client（Prometheus 格式） |
| 追踪 | OpenTelemetry auto-instrumentations |
| 配置解析 | js-yaml（OpenAPI YAML） |

### 缓存与状态抽象

- `project-cache.ts` / `endpoint-cache.ts`：slug 与端点两级 TTL 缓存，降低 Mock 热路径 DB roundtrip。
- `kv-store.ts`：统一 `get/set/incr/del/delByPrefix/countByPrefix` 接口，限流、预算、缓存共用，按 `REDIS_URL` 切 Memory/Redis，多副本一致。

---

## 八、测试

- **单元 + 集成**：Vitest，296 用例（`tests/` + 各模块 `__tests__`）。
- **E2E**：Playwright，119 用例（`e2e/`），覆盖项目管理、端点 CRUD、AI provider、slug 校验、错误场景、模板库等。
- **覆盖率**：`pnpm test:coverage`（v8）。
- **本地 CI 复现**：`pnpm ci:local`（install → build → playwright，`scripts/ci-local.mjs`）。

---

## 九、API 速查

| 方法 | 路径 | 用途 |
|---|---|---|
| ANY | `/{slug}/{path}` | Mock 服务 |
| GET | `/api/health` | Liveness |
| GET | `/api/health/ready` | Readiness 深探 |
| GET | `/api/metrics` | Prometheus 指标（需 token） |
| POST/GET | `/api/admin/backup` | SQLite 备份 / 状态（需 admin token） |
| POST | `/api/ai/generate` | AI 生成 Mock 数据 |
| GET/POST | `/api/ai/providers` | Provider 列表 / 新增 |
| * | `/api/ai/providers/[id]` | Provider 详情/改/删 |
| POST | `/api/ai/providers/[id]/test` | Provider 连接测试 |
| PATCH | `/api/ai/providers/[id]/default` | 设默认 Provider |
| GET/POST | `/api/projects` | 项目列表 / 创建 |
| * | `/api/projects/[id]` | 项目详情/改/删 |
| GET/POST | `/api/projects/[id]/endpoints` | 端点列表 / 创建 |
| * | `/api/projects/[id]/endpoints/[endpointId]` | 端点详情/改/删 |
| GET/POST | `/api/projects/[id]/endpoints/[endpointId]/responses` | 响应规则列表 / 创建 |
| * | `/api/projects/[id]/endpoints/[endpointId]/responses/[responseId]` | 响应规则详情/改/删 |
| GET | `/api/projects/[id]/endpoints/[endpointId]/requests` | 端点请求记录 |
| GET | `/api/projects/[id]/requests` | 项目请求记录 |
| POST | `/api/projects/[id]/import` | 导入 OpenAPI 文件 |
| POST | `/api/projects/[id]/import/parse` | 仅解析预览 |
| GET | `/api/projects/check-slug` | Slug 校验 |
| GET | `/api/share/[slug]` | 分享公开数据 |
