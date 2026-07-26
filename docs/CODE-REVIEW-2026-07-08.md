# ApiMock 代码逐个排查报告（页面 + 后端接口）

> 审查时间：2026-07-08
> 范围：`src/app/**`（页面 + API 路由）全部文件 + 关键 `src/lib/*` 与 `src/components/*`
> 方法：逐文件阅读源码，关键发现已**人工复核确认行号与逻辑**（非纯推测）
> 状态图例：🔴 P0 阻塞/数据损坏/安全漏洞 / 🟠 P1 功能缺陷或重要一致性 / 🟡 P2 健壮性/体验/可访问性

本次为**代码实现层面**的功能审查，不涉及设计文档一致性（已由 `docs/archive/consistency-map.md` 覆盖）。

---

## 0. 全局性结论（跨文件）

| # | 问题 | 严重度 | 说明 |
|----|------|--------|------|
| G1 | **全站无鉴权层** | 🔴 | 仓库无 `src/middleware.ts`，全 `src/app/api/` 无任何 `getSession`/`requireAuth`/`withAuth` 调用。所有项目/AI/请求记录接口对任意匿名调用者开放读写。包括 `DELETE /api/projects/[id]`、`DELETE /api/projects/[id]/requests`（批量清空）、AI provider 的增删改（含加密 apiKey 的替换） |
| G2 | **metrics / backup token 比较非时间安全** | 🔴 | `metrics/route.ts:32` 与 `admin/backup/route.ts:26` 均用 `!==` / `!=` 比较 token，未用 `crypto.timingSafeEqual`。网络攻击者可通过计时差逐字节恢复 `METRICS_TOKEN`/`ADMIN_TOKEN` |
| G3 | **错误响应形状不统一** | 🟠 | 全站应统一 `{success, data?, error?{code,message,details}}`（`@/lib/api`），但实际并存 4 种：① 规范 `Errors.*`；② 平铺字符串 `{success:false, error:'字符串'}`（metrics/backup）；③ 纯中文 `{error:'项目不存在'}`（share）；④ `{status, checks}`（health） |
| G4 | **`endpointsApi.list` 返回联合类型** | 🟡 | `api-client.ts:271` 返回 `Endpoint[] \| ListEndpointsResponse`，调用方需手动 `'items' in` 判别（见 `projects/[id]/page.tsx:481`）。类型不安全，易漏判 |

---

## 1. Mock 服务路由 `src/app/[project]/[...path]/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| M1 | 498-504 | `OPTIONS()` 直接返回 204，**不校验 project 是否存在/激活**，也不经过限流。设计上预检请求豁免尚可接受，但与其它方法行为不一致，且无 `getCorsHeaders()` 之外的任何守卫 | 🟡 |
| M2 | 114-118 | `hasRules` 把"默认响应"（`isDefault` 但无 query/header 规则）当作无规则 fallback。结合 `buildEndpointResponse`（183-198）：无规则的 `isDefault` 响应会落入 `else if (resp.isDefault) { fallback = resp }`，但**普通无规则响应**会落入 `else if (!fallback) { fallback = resp }`——逻辑可读但优先级语义模糊，无单测覆盖多响应混合场景 | 🟡 |
| M3 | 322-339 | 非 JSON body（如 form/multipart）**完全不读取也不记录**（注释自述"不必要"）。但请求记录功能对外承诺记录 body，此处静默丢失非 JSON 请求体，与产品语义有偏差 | 🟡 |
| M4 | 450-496 | 6 个 HTTP 方法 handler 高度重复（仅 `method` 不同）。可由一个 `methods` 表生成，降低维护成本 | 🟡 |
| M5 | 84 | `recordRequest` 失败仅 `console.error`，不进结构化 `logger`（项目其它处用 `@/lib/logger`）。mock 热路径失败不可观测 | 🟡 |

> 说明：限流（296）、body 守卫（313-339）、CORS（393-400 过滤 access-control-*）、异步记录（after）、X-Mock-* 头实现均正确。参数路径匹配（245-259）先精确后模糊、长度校验正确。

---

## 2. 项目接口

### 2.1 `src/app/api/projects/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| P1 | 30-54 | GET 分页与全量两条路径，无分页时返回数组、有分页返回 `{items,total,page,pageSize}`。**形状二义**（见 G4），客户端类型不安全 | 🟡 |
| P2 | 66-67 | slug 生成 `generateSlug(name)`，CJK 名可能产空，靠 68-72 兜底。逻辑正确但错误信息走 `Errors.validation` 构造伪 ZodIssue，类型 hack | 🟡 |

> POST 的 slug 唯一性预检（79-87）、保留字拦截（73-77）实现良好（防 curl 绕过）。

### 2.2 `src/app/api/projects/[id]/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| P3 | 109 | `PUT` 更新 path/slug 后 `updated[0]` 未做空值保护——理论上 update 成功则必存在，但并发 DELETE 后 select 返回 `[]`，`updated[0]` 为 `undefined`，`formatProject(undefined)` 会抛 | 🟡 |
| P4 | 78-94 | PUT 改 slug 有唯一性预检（85-93，防撞库返友好错误），**但 endpoints PUT 改 path/method 无对应预检**（见 E2），两处一致性缺失 | 🟠 |
| P5 | 122-153 | DELETE demo-project 保护（136-144）正确。但全接口无鉴权（G1），任意人可删任意非 demo 项目 | 🔴(归 G1) |

### 2.3 `src/app/api/projects/check-slug/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| P6 | 42-47 | `db.select()`（全列）仅为判存在，应用 `select({id})` 或 `count`。性能小瑕疵 | 🟡 |

---

## 3. 端点接口

### 3.1 `src/app/api/projects/[id]/endpoints/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| E1 | 88-91 | **无分页时也执行 count 查询**。`usePagination`（94）在 count 之后才判断，无分页场景白白多一次全表 count。应将 count 移入 `if (usePagination)` 分支 | 🟡 |
| E2 | 88 | `const [{ count }]` 解构无 `?.` 与 `?? 0` 兜底（对比 projects/route.ts:51 用 `countRows[0]?.count ?? 0`）。SQLite `count(*)` 恒返一行故安全，但风格不一致 | 🟡 |

> POST 的重复预检（176-192，返 409 conflict）实现良好。

### 3.2 `src/app/api/projects/[id]/endpoints/[endpointId]/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| E3 | 108-109 | **PUT 改 path/method 无唯一性预检**，与 POST（有预检）不一致。撞 unique 约束会抛裸 500。对比 projects PUT 改 slug 有预检（P4）——同类缺陷应补齐 | 🟠 |
| E4 | 74-78 | GET 返回 `{...endpoint, responses}`，但 **`isActive`/`isShareable` 未转布尔**（保持 DB 整数 0/1）。POST（249-250）、PUT（153-154）都转了布尔，GET 漏转——**同一资源不同方法返回形状不一致** | 🟠 |
| E5 | 77 | GET 返回 `responses` 数组但**未解析各 response 的 body/headers/matchRules JSON**（对比 responses GET 会 parse）。前端拿到的是原始 JSON 字符串 | 🟠 |

---

## 4. 响应规则接口

### 4.1 `src/app/api/projects/[id]/endpoints/[endpointId]/responses/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| R1 | 168 | POST 返回里塞了 **`isActive: true`** 字段，但 `responses` 表**根本没有 isActive 列**（schema-sqlite.ts:77-94 无此列）。返回了 schema 不存在的字段，类型不一致 | 🟠 |
| R2 | 43-46 | 端点存在性校验 `endpointList[0].projectId !== projectId` 正确（防跨项目越权读），但全链无鉴权（G1） | 🔴(归 G1) |
| R3 | 129-133 | 设默认时先清其它 `isDefault` 再 insert，**两步非事务**。并发 POST 两个 isDefault 可能都清都插，留多个默认 | 🟡 |

### 4.2 `src/app/api/projects/[id]/endpoints/[endpointId]/responses/[responseId]/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| R4 | 150-154 | PATCH 设默认时 `db.update(responses).set({isDefault:0}).where(eq(endpointId))` 清全部，再 157-159 单独 update 当前行设 1。顺序正确（先清后设），但**非事务**，并发 PATCH 设不同行为默认可能互覆盖 | 🟡 |
| R5 | — | 无 `PUT`，仅 `PATCH`。与 endpoints/projects（PUT+PATCH 复用）不一致。API 表面不统一 | 🟡 |

---

## 5. 请求记录接口

### 5.1 `src/app/api/projects/[id]/endpoints/[endpointId]/requests/route.ts`（端点级）

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| Q1 | 39-40 | `parseInt(queryLimit/Offset)` **无 radix、无 NaN 校验、无上限**。`?limit=abc` → NaN → `.limit(NaN)` 行为未定义；`?limit=99999999` 可拖垮 DB。对比 project 级 route 用了 `Math.min(100,...)` 限上限 | 🟠 |
| Q2 | 54-55 | `JSON.parse(req.query/headers)` **未包 try/catch**（body 在 56-62 有 IIFE try/catch）。某行 query/headers 存了坏 JSON，整列请求返 500 | 🟠 |
| Q3 | 78-81 | catch 里判 `z.ZodError`，但**本文件 GET 根本没用 zod schema**（无 `validate`/`parse`）。死代码，暗示缺失的输入校验 | 🟡 |
| Q4 | 73 | 返回 `{requests, total, limit, offset}`，**与 project 级 route 的 `{items, total, page, pageSize}` 形状不同**。同表两接口契约不一致 | 🟠 |
| Q5 | 109 | DELETE 返 `{message}`，project 级返 `{deleted: N}`。不一致 | 🟡 |
| Q6 | 53 | `...req` 展开**泄露 `ip`/`userAgent`**（mock 调用方 PII），叠加无鉴权（G1）= 公开 PII 泄露 | 🟠(归 G1 加重) |

### 5.2 `src/app/api/projects/[id]/requests/route.ts`（项目级）

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| Q7 | 31-32 | `pageSize` **无上限**（`Math.min` 都没加，对比 projects/route.ts:44 有 `Math.min(100,...)`）。`?pageSize=1000000` 可 DoS | 🟠 |
| Q8 | 21-165 | GET/DELETE **均无顶层 try/catch**。NaN 分页抛裸 500 | 🟠 |
| Q9 | 214-216 | 逐端点 `for` 循环 `await db.delete`，N 次 round trip、无事务、中途失败留半删。返回 `deleted: targetEndpointIds.length` 是**端点数而非实际删除行数**，数值误导 | 🟡 |
| Q10 | 151 | `...req` 同样泄露 ip/userAgent | 🟠(归 G1) |

---

## 6. 导入接口

### 6.1 `src/app/api/projects/[id]/import/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| I1 | 121-135 | 批量 insert **无事务**（注释自述 better-sqlite3 transaction 是 sync callback 装不下 await）。endpoints 插入成功后 responses 插入失败，留无响应的半成品端点。import 虽低频但数据一致性受损 | 🟠 |
| I2 | 113 | `isDefault: response.statusCode === 200 ? 1 : 0`——若某端点**多个 200 响应**（如带不同 matchRules），会产生多个 isDefault=1，违反"每端点最多一默认"不变量 | 🟡 |
| I3 | 95 | 新端点固定 `responseBody: '{}'`，但 `statusCode: 200`/`contentType: application/json` 已设。空对象 body 与 200 配合尚可，但若解析出的 path 无 200 响应，端点级仍是空 `{}` 占位 | 🟡 |

### 6.2 `src/app/api/projects/[id]/import/parse/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| I4 | 19-20 | 解析 `_projectId` 直接 void 丢弃，**不校验项目存在**。parse 本不写库可接受，但 import（写库）校验了，parse 不校验语义不对称 | 🟡 |
| I5 | 48-58 | parse 预览返回的 `responses` 形状 `{statusCode: {body}}`，与 import 实际入库结构（responses 表多字段）不同。预览与入库模型割裂 | 🟡 |

---

## 7. AI 接口

### 7.1 `src/app/api/ai/generate/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| A1 | 199-219 | **显式 `providerId` 失败/未激活静默降级**到默认 provider → env → 模板。调用方指定了 provider 却拿到别家结果，无任何错误信号。失败仅 `console.error`，metrics 也只在成功时 inc（152） | 🟠 |
| A2 | 273-276 | 上游 OpenAI 错误（401 坏 key / 429 限流）**全坍缩为 500 `INTERNAL_ERROR`**，不透传状态码，客户端无法区分"配额超限"与"服务端 bug" | 🟠 |
| A3 | 126-134, 237-245 | OpenAI SDK 调用**无 timeout / AbortController**。SDK 默认 ~10 分钟，挂起的 provider 会长时间挂住请求 | 🟠 |
| A4 | 150 | token 估算 fallback `Math.ceil(content.length/4)` 只算 completion 文本，**不含 prompt tokens**，低估日预算消耗 | 🟡 |
| A5 | 185-191 vs 151 | budget `checkAiBudget` 是读、`recordAiUsage` 在成功后才记。**N 并发都观察到 allowed 全过**，请求轴超限。best-effort 非硬上限 | 🟡 |

### 7.2 `src/app/api/ai/providers/route.ts` 与 `[id]/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| A6 | providers:100 | `body.isDefault` 从**未经 schema 校验的原始 body** 读取（CreateProviderSchema:20-28 无 isDefault 字段）。DB 写入依赖未类型化输入，与其余用 `data.*` 不一致 | 🟡 |
| A7 | providers:91-97 | 判"是否首个 provider"用 `select({count: id}).from(aiProviders)` 返回全行再 `.length`，应 `count(*)`。小性能问题 | 🟡 |
| A8 | providers:99-106 | 设默认"先清后插"**非事务**，并发两 POST(isDefault) 可都清都插留多默认。`[id]/default/route.ts:33-43` 同病 | 🟡 |
| A9 | [id]:84-86 | 改 `models` 时若未给 `defaultModel`，代码"用 models[0]"覆盖现有 defaultModel，**即使用户原 default 仍在新列表内**。意外副作用 | 🟡 |
| A10 | [id]:27-38 | `defaultModel ∈ models` 的 refine 仅在**两者同传**时校验。单独 PATCH `defaultModel` 不校验是否在现有 models 内 | 🟡 |
| A11 | [id]:81+109 | PATCH 设 `isActive:false` **不清 isDefault**。generate(214) 跳过 isActive≠1，导致"配了默认却不可用"的死状态 | 🟡 |
| A12 | [id]:161-170 | DELETE 后把"另一 provider 提为默认"用 `findMany` 无 `orderBy`，**选谁随机** | 🟡 |
| A13 | providers:24 | `apiKey: z.string().min(1)` **无 max**，无限长 key 入库（且要 AES 加密），可滥用 | 🟡 |
| A14 | GET:45 | `JSON.parse(p.models)` 可能抛（坏数据），catch 返通用 500 | 🟡 |

### 7.3 `src/app/api/ai/providers/[id]/test/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| A15 | 50-52,77-84,95-103 | **失败用 `success:true` 包 `success:false` 内层**——顶层信封说成功、内层说失败。违反项目契约（失败应 `Errors.*`） | 🟠 |
| A16 | 95-103 | 401/429/超时/网络错全合并成同一句"Check your API key and base URL"，无状态码 | 🟡 |
| A17 | 全文件 | **无 rate limit、无鉴权**。叠加无鉴权建 provider（G1），攻击者可建指向任意 SSRF-passing URL 的 provider 并反复 `/test` 发起出站请求，把服务变成请求转发/扫描代理 | 🟠 |
| A18 | 44 | `JSON.parse(provider.models)` 可能抛 | 🟡 |

### 7.4 `src/app/api/ai/budget/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| A19 | 全文件 | **无 try/catch**。`getBudgetStatus()` 抛错（KV/Redis 故障）则破坏统一响应形状 | 🟡 |
| A20 | — | 运维遥测（日花费/限额）无鉴权（G1） | 🟠(归 G1) |

---

## 8. 系统接口

### 8.1 `src/app/api/health/route.ts` / `health/ready/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| H1 | ready:31 | **`SQLITE_PATH` 当目录用**：`path.resolve(process.env.SQLITE_PATH \|\| './data')`。但 `db-sqlite.ts:11` 把 `SQLITE_PATH` 当**完整文件路径**（`./data/apimock.db`）。`path.resolve('./data/apimock.db')` 得文件路径，`path.join(filePath, probe)` 写到 `./data/apimock.db/.ready-probe-xxx` 失败 → **fs 检查误报 degraded**。默认配置下 readiness 永远 degraded | 🟠 |
| H2 | ready:33-35 | 每次 readiness 探活 **同步 `writeFileSync`+`unlinkSync`**。K8s/Railway 探活几秒一次，同步 IO 阻塞事件循环 | 🟡 |
| H3 | — | health 与 ready 均返回 `{status,...}` 裸对象，非统一信封（G3，但探活端点可豁免，待确认是否有意） | 🟡 |

### 8.2 `src/app/api/metrics/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| H4 | 32 | `gotHeader !== expected && gotQuery !== expected` **非时间安全**（G2）。计时侧信道可恢复 token | 🔴 |
| H5 | 30,32 | 支持 `?token=` query 鉴权，**token 进 access log**（代码注释自认）。反代/浏览器历史/Referer 泄露 | 🟠 |
| H6 | 21-24,34 | 401/503 返 `{success:false, error:'字符串'}`，error 是字符串非对象，与 `Errors.*` 形状不符 | 🟡 |
| H7 | 47-49 | `registerContentType()` 名不副实（不注册只返硬编码 MIME），且忽略 prom-client 真正的 `register.contentType`，可能漂移 | 🟡 |
| H8 | 37 | `metricsOutput()` 无 try/catch，HMR 重复注册 metric 等场景抛裸 500 | 🟡 |

### 8.3 `src/app/api/admin/backup/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| H9 | 26 | `got !== expected` **非时间安全**（G2） | 🔴 |
| H10 | 38 | 失败返 `{success:false, data: result}`——**失败仍带 data**，违反信封（失败应只用 error）。客户端按 `{success,data?}` 解析会拿到矛盾的 data | 🟡 |
| H11 | 47 vs backup.ts:17 | GET 在响应时读 `BACKUP_DIR`，`backup.ts` 在模块加载时读，**两者可能不一致**（serverless 重部署），状态接口谎报备份目录 | 🟡 |
| H12 | 48 | `Number(BACKUP_KEEP) \|\| 7`：若设 `BACKUP_KEEP=0`（禁用保留），`0\|\|7` 静默变 7。掩盖运维配置 | 🟡 |

> backup.ts **无路径穿越**（文件名由时间戳生成，无用户输入），这点安全。

### 8.4 `src/app/api/share/[slug]/route.ts`

| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| H13 | 50 | **公开未鉴权返回 `responseBody`**（完整 mock 响应体，最大 1MB）。叠加 `isShareable` 默认 1（endpoints POST:213"默认可见"）= **默认全公开**。mock body 常含示例 PII/密钥，信息泄露 | 🟠 |
| H14 | 27,53 | 仅过滤 `isShareable=1`，**未过滤 `isActive`**（端点 53 行、项目 27 行均未）。禁用的端点/项目仍公开 | 🟠 |
| H15 | 50 | `responseBody` **未 JSON.parse**（对比 endpoints route 会 parse）。share 消费方拿到 JSON-as-string，形状与 endpoints API 不一致 | 🟡 |
| H16 | — | **无 `export const dynamic = 'force-dynamic'`**，其余 API 路由均有。可能被静态缓存，编辑后分享页显示陈旧数据，或 CDN 把 A 项目数据缓到 B 项目 URL | 🟠 |
| H17 | 30-33,72-75 | 错误 `{error:'项目不存在'}`/`{error:'服务器错误'}` 纯中文平铺，非 `Errors.*`（G3） | 🟡 |
| H18 | 71 | `console.error` 而非结构化 `logger`（其余系统路由用 logger） | 🟡 |

---

## 9. 页面层（`src/app/**/page.tsx`）

### 9.1 `src/app/page.tsx`（首页）
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| FE1 | 74 | 演示 curl 硬编码 `/demo-project/users`，未关联真实 `DEMO_PROJECT_SLUG`。slug 不符时复制即 404 | 🟡 |

### 9.2 `src/app/projects/page.tsx`（项目列表）
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| FE2 | 44-57 | `handleDelete` 成功后**无任何反馈**（不 toast、不提示），项目直接消失。失败才 setError | 🟡 |
| FE3 | 68-69 | 删除后 `page` 未夹紧。删掉第 2 页最后一项后停在第 2 页空白，`pagedProjects=[]` | 🟡 |
| FE4 | 120-126 | 搜索 input 无 `<label>`/`aria-label`（对比清除按钮有 aria-label） | 🟡 |
| FE5 | 28-30 | `useEffect([])` 仅 mount。别处建项目后浏览器前进/后退返回，列表不刷新（无 router.refresh） | 🟡 |

### 9.3 `src/app/projects/new/page.tsx`（新建项目）⭐ 有 P1
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| FE6 | 116-135 | **`handleNameChange` 无条件用 `generateSlug(name)` 覆盖 slug**，无 `slugManuallyEdited` 标志。用户手动改好 slug 后修 name 里一个错字 → 自定义 slug 被静默覆盖 | 🟠 |
| FE7 | 99-100 | `setSlugStatus(result.available ? 'available' : 'exists')` **忽略 `reason` 字段**（'reserved'/'exists'）。保留字 slug 被误显示为"已被使用"，误导用户 | 🟡 |
| FE8 | 197-200 | submit guard 在 `slugStatus==='error'` 时提示"请等待验证完成"——但验证已终态失败，用户死等 | 🟡 |
| FE9 | 74-114 | slug 校验 fetch **无 AbortController**。timer 触发后 unmount 仍 setState；慢响应覆盖快响应留陈旧结果 | 🟡 |
| FE10 | 227-234 | `canSubmit` 表达式混 boolean 与 string，`slugStatus==='error'` 时按钮可点但 handler 拒绝，按钮态与行为不符 | 🟡 |
| FE11 | 全文件 | 所有 `<label>` 无 `htmlFor`/`id` 关联控件 | 🟡 |

### 9.4 `src/app/projects/[id]/page.tsx`（项目详情）⭐ 有 P1
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| FE12 | 437-443 | **请求记录 tab 永远空**。effect `if(activeTab==='requests') loadRequests()` 依赖数组 `[projectId, requestsPage, requestsEndpointFilter]` **漏了 `activeTab`**（被 eslint-disable）。初始 `activeTab='endpoints'` 不触发，点 tab 也不触发。"请求记录"功能形同失效 | 🟠 |
| FE13 | 463-496,576 | 每次 `page`/`debouncedSearch`/`methodFilter`/`tagFilter` 变都 `setLoading(true)`，渲染分支 `if(loading)` 返**整页骨架屏**。搜索每按一键整页闪白，丢滚动位置 | 🟡 |
| FE14 | 1156-1169 | 删除项目的 `ConfirmDialog.onConfirm` 是 async，但先 `setShowDeleteDialog(false)` 再 await delete。无 spinner、失败仅 toast 无法从弹窗重试。`handleClearRequests` 同样未 await | 🟡 |
| FE15 | 446-454 | 空项目引导 effect 每当列表回到空就重新弹 OnboardingModal，无"不再提示"持久化 | 🟡 |
| FE16 | 457-461 | `?edit=true` 自动开编辑窗，**不剥离 URL 参数**，后续 state 变可能反复弹窗 | 🟡 |
| FE17 | 1035-1072 | 请求记录行用 `<Card onClick>` 无 `role="button"`/`tabIndex`/键盘 handler，键盘用户不可达 | 🟡 |
| FE18 | 全文件 | 自定义 modal（EditProjectDialog/RequestDetailDialog）无 Escape、无 focus trap、无 portal | 🟡 |

### 9.5 `src/app/projects/[id]/endpoints/new/page.tsx`（新建端点）⭐ 有 P1
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| FE19 | 107-125 | **空路径校验是死代码**：`const normalizedPath = path.trim() \|\| '/'` 后 `if(!normalizedPath)` 永不成立（'/' truthy）。空 path 提交返 undefined（通过校验），`endpointsApi.create({path:''})` 建出坏端点或被服务端拒 | 🟠 |
| FE20 | 79-96 | `loadProject` 失败静默 `setProject(null)`，页面仍渲染完整表单（无 not-found 守卫），用户填完提交才在不存在项目上报错 | 🟡 |
| FE21 | 358-558 | `<form id="endpoint-form">` 只包基本信息 Card，**响应配置 Card 在 form 外**。响应字段里按 Enter 不提交 | 🟡 |
| FE22 | 547,625 | `delayMs` `parseInt \|\| 0` 接受负数（min 仅 HTML 属性）；`statusCode` 清空得 NaN → stringify 成 null | 🟡 |
| FE23 | 171-174 | `JSON.stringify(data, null, 2)` 若 AI 返 undefined 得 undefined（非字符串），下游 JsonEditor 与 `JSON.parse(form.responseBody)` 崩 | 🟡 |

### 9.6 `src/app/projects/[id]/endpoints/[endpointId]/page.tsx`（端点详情）
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| FE24 | 239-280 | `loadData` 失败 toast 后留 `endpoint=null`，渲染"端点不存在"，无重试按钮，无法区分 404 与网络错 | 🟡 |
| FE25 | 292-302 | `handleCopyUrl` 的 `setTimeout(()=>setCopied(false),2000)` unmount 后仍触发 setState | 🟡 |
| FE26 | 401-414 | `handleDelete` async 喂给 `onConfirm:()=>void`，弹窗不 await 无 spinner，可重复点删除 | 🟡 |
| FE27 | 385-387 | update 成功后 `setEndpoint(updated)`（服务端值）但 `setInitialForm(form)`（客户端值），二者源不一致，`isDirty` 比较错位 | 🟡 |
| FE28 | 325-343 | 同 FE19 的死代码空路径校验 | 🟡 |
| FE29 | 530-551 | 未保存变更守卫只拦截面包屑项目名链接与取消按钮，**首页/项目列表面包屑、删除按钮、新窗口测试链接均不拦截**，可静默丢编辑 | 🟡 |

---

## 10. 组件层（`src/components/*`）

### 10.1 `ResponseRuleEditor.tsx` ⭐ 有 P0
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| C1 | 225,252,563-581 | **matchRule 键冲突致数据丢失**：`addQueryMatch` 插 `{''}`（224），对象键唯一 → 连点两次"添加"只剩一行；重命名 `newEntries[index]=[newKey,value]` 后 `Object.fromEntries` 同名键合并丢值；重命名后 value input 仍调 `updateQueryMatch(key,...)`（旧键）写入错位。header 同理。**可复现的数据完整性 bug** | 🔴 |
| C2 | 160-166,114 | 编辑现存 response 时 `JSON.parse(body)` 若坏（外部改坏）直接抛"无效 JSON"，用户无法在编辑器里修复（parse 先于提交校验） | 🟠 |
| C3 | — | `useEffect[projectId,endpointId]` 无 abort/cleanup，快速切端点会把旧端点的 responses 套到新端点 | 🟠 |
| C4 | 215 | `handleContentTypeChange` 切 contentType 时**用默认 body 覆盖用户已编辑内容**，无确认 | 🟡 |
| C5 | 440 | 背景遮罩 `bg-black/50` 无 onClick 关闭，与其它弹窗不一致；无 Escape/focus trap | 🟡 |

### 10.2 `AiGenerateDialog.tsx`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| C6 | 103-108 | **只判 `res.ok` 不判 `json.success`**。服务端返 200+`{success:false,error}` 时当成功，`onGenerated(undefined)` 致父组件崩 | 🟠 |
| C7 | 99 | `providers.length===0` 时 select 隐藏、`selectedProviderId=''`，请求发 `providerId:undefined`，用户只见"生成失败"不知要先配 provider | 🟡 |
| C8 | 140 | backdrop `onClick={handleClose}` 未检查 `isLoading`，请求中可关弹窗放弃 in-flight fetch（无 abort） | 🟡 |
| C9 | — | 无 `role="dialog"`/`aria-modal`/Escape/focus trap | 🟡 |
| C10 | 111 | `trackEvent` 仅成功时调，AI 失败对分析不可见 | 🟡 |

### 10.3 `ImportOpenAPI.tsx`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| C11 | 102 | 同 C6：`parseFile` 只判 `res.ok`，200+`{success:false}` 时 `data` undefined → `data.endpoints` 抛 TypeError | 🟠 |
| C12 | 122-129 | **import 阶段重新上传原始文件而非已解析 endpoints**。若服务端 parse 非确定或文件被改，预览与入库不符；且大文件传两遍 | 🟠 |
| C13 | 48-56,87-100 | **无客户端文件大小预检**，2GB 文件直接流式上传 | 🟠 |

### 10.4 `RequestRecords.tsx`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| C14 | 35-39 | `useEffect[projectId,endpointId]` 无 abort，快速切端点旧响应覆盖新（与 C3 同） | 🟠 |
| C15 | — | 无自动刷新/轮询，"请求记录"视图不实时更新，须手动重进 | 🟡 |
| C16 | 158 | `formatDate(new Date(createdAt).toISOString())` 冗余且可能时区错乱 | 🟡 |

### 10.5 `settings/ProviderList.tsx`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| C17 | 95 | 删除用 `window.confirm`：阻塞主线程、不可样式化、沙箱 iframe 内静默返 false。与全站 `ConfirmDialog` 不一致 | 🟠 |
| C18 | 74-101 | 图标按钮（Star/Settings/Trash2）缺 `aria-label`（Star 仅 title） | 🟡 |
| C19 | 69 | `provider.models.length` 未防 null（坏数据崩） | 🟡 |

### 10.6 `settings/AddProviderDialog.tsx`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| C20 | 244-251 | **Models 文本框静默吞解析错**：onChange `JSON.parse` 失败时啥也不做，`formData.models` 留旧值。显示文本与内部状态分叉，提交发陈旧数组 | 🟠 |
| C21 | 62-103,132 | 关闭弹窗时 effect 的 `else if(isOpen)` 分支不执行 → **表单不重置**，下次无 preset 打开显示上次残留 | 🟠 |
| C22 | 121-130 | `handleSubmit` try/finally **无 catch**。依赖父级吞错，`loading` 与真实成败脱钩 | 🟡 |
| C23 | 233 | 编辑时 apiKey 留空，父级 `handleUpdateProvider` 发 `apiKey:''`。服务端若把空串当"清空 key"则改任意字段会抹掉密钥（待核服务端语义） | 🟡 |
| C24 | 135 | 背景遮罩无 onClick 关闭，与 AiGenerateDialog/ImportOpenAPI 不一致 | 🟡 |

### 10.7 `settings/ai/page.tsx`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| C25 | 54,74,92,114,136,155 | **6 处全用裸 `fetch` 绕过 `api-client`**（G4 一致性问题 + 错误处理重复） | 🟠 |
| C26 | 90-131 | `json.error` 是 `{code,message}` 对象，但 `toastError(json.error \|\| '...')` 当字符串 → toast 显示 `[object Object]` | 🟠 |
| C27 | 84-87 | `loadProviders`/`loadBudget` 无 abort，慢响应覆盖快响应、unmount 后 setState | 🟡 |

---

## 11. 关键 lib

### 11.1 `src/lib/ssrf.ts`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| L1 | 63-71 | **`validateUrlSafe` 不解析 DNS**。仅查字面 hostname 与 `isPrivateIP(hostname字符串)`，不 resolve 域名实际 IP。`evil.com`（解析到 169.254.169.254）可通过。DNS rebinding / 云元数据端点窃取可达 | 🔴 |
| L2 | 7-20 | **缺 IPv6 ULA 范围 `fc00::/7`**（唯一本地地址）与其它保留段。仅挡 `::1`/`::`/IPv4-mapped | 🟡 |
| L3 | 40-45 | `BLOCKED_HOSTNAMES` 仅 4 项，缺 `169.254.169.254` 字面量、AWS/GCP/Azure 各类元数据主机名变体 | 🟡 |

### 11.2 `src/lib/rate-limit.ts`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| L4 | 38 | `resetAt = Date.now()+windowSec*1000` 每次调用重算，非窗口真实起点。X-RateLimit-Reset 头每次都"未来 60s"，指标略偏（非功能 bug） | 🟡 |

### 11.3 `src/lib/db.ts`
| # | 行 | 问题 | 严重度 |
|----|----|------|--------|
| L5 | 18,21 | mysql 强转 sqlite 类型（`as unknown as Db`）。调用方 await 兼容，但**类型层面 mysql 的 async 接口被伪装成 sync**，IDE 无法发现真正的 async 语义差异。注释已诚实声明 | 🟡 |

---

## 12. 优先级汇总与建议修复顺序

### 🔴 P0（安全/数据损坏，建议立即修）
1. **G1 全站无鉴权** — 加 `middleware.ts` 或路由级 auth 守卫，至少保护 admin/AI/DELETE/requests
2. **G2/H4/H9 token 非时间安全比较** — 改 `crypto.timingSafeEqual`（metrics、backup）
3. **L1 SSRF 不解析 DNS** — resolve 后校验 IP，或限制 baseUrl 白名单
4. **C1 ResponseRuleEditor 键冲突丢数据** — 改用数组而非对象存 matchRules，或禁止重复空键

### 🟠 P1（功能缺陷/重要不一致）
5. **FE12 请求记录 tab 永不加载**（`activeTab` 漏依赖）
6. **FE6/FE19 新建项目 slug 被覆盖 / 空路径校验死代码**
7. **A1/A2/A3 AI generate 静默降级 + 状态码坍缩 + 无超时**
8. **H13/H14/H16 share 公开 responseBody + 不过滤 isActive + 无 force-dynamic**
9. **E3/E4/E5 endpoints PUT 无唯一性预检 + GET 布尔未转 + responses 未 parse**
10. **R1 responses POST 返不存在的 isActive 字段**
11. **Q1/Q2/Q7/Q8 请求记录 NaN 分页 + 坏 JSON 致 500 + 无上限**
12. **A17 AI test 无限流出站请求放大**
13. **C11/C12/C20/C21/C25/C26 前端绕 api-client + 错误形状处理 + 弹窗状态 bug**
14. **H1 health/ready SQLITE_PATH 误判目录致 fs 永远 degraded**

### 🟡 P2（健壮性/体验/可访问性）
大量布尔转换、label 关联、focus trap、abort controller、死代码、性能小瑕疵——见各表。

---

## 13. 验证说明

- 本报告所有 🔴/🟠 项均已**人工开文件复核行号与逻辑**，非纯 agent 推测。
- 🟡 项部分来自探索代理，抽样复核确认可信，但未逐条开文件（量大）。
- 本次**未运行** typecheck/test/E2E（任务为代码排查，非整改）。
- 历史一致性审查见 `docs/archive/consistency-map.md`（设计↔实现对照），本报告聚焦**实现内部的功能/安全缺陷**，二者互补。

*本报告为审查快照，修复后应更新对应项状态。*
