# 数据模型

> 自动同步自 `src/lib/schema-sqlite.ts`（MySQL schema 在 `schema-mysql.ts` 镜像）。

## 五张表

### `projects`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | nanoid |
| `name` | text notNull | 显示名 |
| `slug` | text unique | URL 标识符 |
| `description` | text | 描述（可空） |
| `basePath` | text | 前缀路径（可空） |
| `isActive` | integer default 1 | 1=启用 / 0=禁用 |
| `settings` | text default `'{}'` | JSON 配置 |
| `createdAt` / `updatedAt` | integer | Unix ms |

**索引**：`slug` 唯一索引。

**demo-project 删除保护**：`projects/[id] DELETE` 拒绝删除 slug === `demo-project` 的项目，返 403。

### `endpoints`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | |
| `projectId` | text FK → projects.id | cascade delete |
| `path` | text | `/users` / `/users/:id` |
| `method` | text enum | GET / POST / PUT / DELETE / PATCH / HEAD / OPTIONS |
| `name` / `description` | text | 显示元数据（可空） |
| `isActive` | integer default 1 | |
| `delayMs` | integer default 0 | 响应延迟 |
| `tags` | text default `'[]'` | JSON 字符串数组 |
| `statusCode` | integer default 200 | 端点级默认响应码 |
| `contentType` | text default `application/json` | |
| `responseBody` | text | 端点级默认响应体（fallback，responses 表无匹配时才用） |
| `createdAt` / `updatedAt` | integer | |

**唯一约束**：`(projectId, method, path)` 复合唯一索引。
**创建预检**：`endpoints POST` 命中重复返 409，不再抛裸约束错误。

### `requests`

请求日志，mock 路由每次调用（含 404）写一条。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | |
| `endpointId` | text FK → endpoints.id | cascade delete，404 时为 null |
| `method` / `path` | text | |
| `query` / `headers` / `body` | text | 序列化字符串 |
| `responseStatus` | integer | |
| `responseTime` | integer | ms |
| `ip` / `userAgent` | text | |
| `createdAt` | integer | |

**索引**：`endpoint_id` + `created_at`。
**保留策略**：每 10 分钟清理，保留每端点最近 1000 条（见 `src/lib/request-retention.ts`）。

### `responses`

多响应规则，按 query/header 匹配返回不同响应。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | |
| `endpointId` | text FK → endpoints.id | |
| `name` / `description` | text | |
| `statusCode` | integer notNull default 200 | |
| `headers` | text default `'{}'` | JSON |
| `body` | text | |
| `contentType` | text default `application/json` | |
| `matchRules` | text default `'{}'` | `{ query?: {...}, header?: {...} }` |
| `isDefault` | integer default 0 | 兜底响应 |
| `priority` | integer default 0 | 规则匹配优先级 |
| `createdAt` / `updatedAt` | integer | |

**索引**：`endpoint_id`。
**优先级**：规则匹配 > 默认（isDefault=1）> 无规则。无任何匹配时 fallback 到 `endpoints.responseBody`，仍无则 200 + 空体。

### `ai_providers`

AI 服务商配置，AES-256-GCM 加密存储 apiKey。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | |
| `name` | text notNull | |
| `provider` | text enum | openai / anthropic / openai-compatible |
| `baseUrl` | text | 自定义端点（可空） |
| `apiKey` | text notNull | 加密后字符串 |
| `models` | text notNull | JSON 字符串数组 |
| `defaultModel` | text | |
| `systemPrompt` | text | |
| `isActive` | integer default 1 | |
| `isDefault` | integer default 0 | 全局默认 provider（最多一个 isDefault=1） |
| `createdAt` / `updatedAt` | integer | |

**删除保护**：删默认 provider 时自动重指一个 active provider 为默认（`ne(id)`，不再误删自己）。

## 关系

```
projects 1───N endpoints 1───N requests
                    └──── 1───N responses

ai_providers (独立)
```

所有 FK 均 `onDelete: cascade`，删 project 自动清理 endpoints / requests / responses。
