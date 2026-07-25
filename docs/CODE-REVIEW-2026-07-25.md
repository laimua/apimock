# 代码审查报告 — 2026-07-25

> 新一轮全量复审（继 2026-07-08 审查 92 项修复之后）。
> 方法：4 路并行深查（API 路由层 / mock 引擎 / 前端 / 安全与基础设施），关键发现经多路独立确认 + 抽验实证。
>
> **验证基线**：`tsc --noEmit` 通过；`eslint` 通过（1 个 warning）；**单测全绿：40 文件 / 371 测试通过**（Node 22；本机默认 Node 16 无法运行 pnpm/vitest，属环境问题）。
> E2E（Playwright）本轮未跑，需起服务环境。

**统计：P0 × 1，P1 × 19，P2 × 30+**

总体判断：鉴权层（HMAC cookie、timing-safe 比较、fail-closed、保留 slug 防护、开放重定向防护）扎实，未发现鉴权绕过或跨项目 IDOR。主要问题集中在：**OpenAPI 导入链路基本名存实亡**、一枚未鉴权 DoS 缺口、SQLite 级联删除静默失效、前端错误形状误用导致白屏。

---

## 三方复核记录（kimi + codex + 作者，2026-07-25）

复核结论：**P0/P1 绝大多数属实，可直接按报告修**。全部确认属实：P0-1、P1-1、P1-4~P1-8、P1-10~P1-13、P1-15~P1-19，抽查 P2-9/16/18/31/32/53 亦属实。分歧与修订如下（报告正文已按此修订）：

| 编号 | 复核结论 | 处理 |
|------|----------|------|
| P0-1 | codex：JSON chunked 最终仍会 413，只是检查发生在 `text()` 全量读入之后——fast-path 失效、内存放大真实，"完全绕过"措辞需精确 | **接受**，已修订措辞 |
| P1-2 | codex："'{}' 只是末位 fallback，正常路径返回 isDefault 响应体，根因是 P1-1" | **不接受，维持原判**。kimi 逐行复核证据：import 恒写 `responseBody:'{}'`（`import/route.ts:96`）；导入响应 `matchRules` 默认 `'{}'` → `hasRules` false → `matched` 恒 null（`schema-sqlite.ts:87` + mock `route.ts:106-118`）；而求值顺序是 matched → **端点级 responseBody** → responses fallback（mock `route.ts:201-215`），`'{}'` 在 fallback **之前**返回。codex 疑被 `:205` 注释（"端点级 responseBody 作 fallback"）误导——注释是设计意图，代码顺序与意图不符。**推论：P1-1 修好后 P1-2 不会自动消失，两条修复都必须做** |
| P1-3 | codex：导入 responses priority 全为 0，fallback 归属实际取决于存储顺序，非"恒失效" | **接受**，已弱化措辞（对 UI 创建的显式 priority 响应，抢占仍确定性触发） |
| P1-10 | codex：malformed-json 场景是**功能完全无效**，不只"目的落空" | **接受**，已强化措辞 |

codex 补充的协同风险（已补入正文）：
- **P0-1 × P2-28 协同**：直连部署下 `X-Real-IP` 可伪造 → 攻击者轮换 IP 绕过限流兜底，P0-1 实际可利用性比单独评估更高。**限流不能作为 DoS 主防线**，P0-1 的流式修复不可替代。
- **迁移同步性未核验**：`drizzle/0001+` 迁移文件与 `schema-sqlite.ts`/`schema-mysql.ts` 的同步性本轮未覆盖（低概率遗留），已加入待验证清单。

### P1-2 机器实证（2026-07-26，终结三方分歧）

codex 在二次复核中**坚持** P1-2 判错了："'{}' 只是末位 fallback，正常路径返回 isDefault 响应体"。kimi 回应"代码顺序核了两遍，有信心"，并提出最直接实证：插数据 → 打请求 → 看返回。

作者用 vitest 做了这个实证（`src/lib/__tests__/p1-2-import-return-proof.test.ts`，Node 22，3/3 通过）：
- 构造 import 写入的真实数据形态：`endpoint.responseBody='{}'` + 一条 `isDefault` 响应（`matchRules='{}'`、`priority=0`）
- 用 route.ts:171-215 的真实选择逻辑跑 `buildEndpointResponse`
- **实测返回 `"{}"`**，确认 kimi 正确、codex 错误

字节级校验：实证测试里的选择逻辑与 route.ts 真实源码归一化后**逐字节一致**（唯一差异是变量名 `sorted` vs `responseList`，因测试里手动代替了 db 查询排序；所有 `matched`/`fallback`/206 检查/215 return 控制流完全相同）。

**裁决**：kimi 维持原判成立。`:205` 注释（"端点级 responseBody 作 fallback"）描述的是**设计意图**，代码顺序（206 在 215 之前）与之**矛盾**——codex 正是被注释带偏，把变量名 `fallback` 误当成执行顺序。**P1-1 与 P1-2 相互独立，两条都必须修。**

---

## P0 — 未鉴权可达

### P0-1 mock 路由 1MB body 限制的 fast-path 可被 chunked 编码绕过 → 未鉴权内存 DoS

`src/app/[project]/[...path]/route.ts:315-330`

```ts
const declaredContentLength = parseInt(request.headers.get('content-length') ?? '', 10);
if (!Number.isNaN(declaredContentLength) && isBodyTooLarge(declaredContentLength)) {
  return makePayloadTooLarge();
}
// ...
const rawText = await cloned.text();            // ← 全量读入内存，无上限
if (isBodyTooLarge(utf8ByteLength(rawText))) {  // ← 检查在读完之后
```

- 攻击场景：`Content-Type: application/json` + `Transfer-Encoding: chunked`（无 content-length）→ fast-path 跳过 → **413 最终仍会返回，但发生在 `text()` 把整个 body 读入内存之后**——绕过的是 fast-path 预检，不是限制本身；内存放大真实存在。限流 100/min/IP 不救场（单 IP 每分钟仍可提交 100 个超大 body，并发即 OOM）。该路由不在 proxy matcher 内，完全匿名。
- **协同风险（codex 补充）**：与 P2-28 叠加时实际可利用性更高——直连部署下 `X-Real-IP` 可伪造，攻击者轮换 IP 可连限流兜底一并绕过。**限流不能作为 DoS 主防线**，本条必须修代码本身。
- **修复**：`request.body.getReader()` 流式读取，累计字节超 `MAX_BODY_BYTES` 立即 cancel + 413；不要先 `text()` 后检查。（`:334-338` 的 `else if` 分支里 `isBodyTooLarge(declaredContentLength)` 与 `:315` 重复，可顺手删。）

---

## P1 — 功能错误

### A. OpenAPI 导入链（三条独立确认 + 实证，功能名存实亡）

**P1-1 `$ref` 解析整体失效（已实证运行验证）**
`src/lib/openapi-parser.ts:74`：`resolveRefs` 递归到 `$ref` 节点时调用 `resolveRefPointer(doc, refPath)`，把**当前节点**当文档根做指针查找，`#/components/schemas/X` 永远查不到 → 静默返回未解析的 `{$ref}`。OpenAPI 3 文档几乎必用 `components/schemas`，导入的 mock 响应体普遍是未解析引用字面值。
现有单测（`src/lib/__tests__/openapi-parser.test.ts:126-134`）只断言 `typeof === 'object'`（`{$ref}` 也是对象），掩盖了 bug。
**修复**：`resolveRefs` 增加 root 参数（首次调用传入文档根，递归透传），`$ref` 分支改 `resolveRefPointer(root, refPath)`；同时加循环引用 guard（WeakSet/深度上限），否则修复后 `#/A → #/A` 自引用会死循环；测试补"解析后等于目标 schema"的相等断言。

**P1-2 导入的端点 mock 恒返回 `{}`**
`src/app/api/projects/[id]/import/route.ts:96` 导入时写死 `responseBody: '{}'`，同时把真实示例写进 responses 表。但 mock 路由选择顺序中端点级 body 恒优先：

```ts
// src/app/[project]/[...path]/route.ts:206-213
if (endpoint.responseBody !== null && endpoint.responseBody !== undefined) {
  return toResponseObj(endpoint, { ..., body: endpoint.responseBody });  // '{}' 永远先命中
}
return toResponseObj(endpoint, fallback);  // 导入的 isDefault 响应永远到不了
```

导入响应的 matchRules 全是 `'{}'`（schema 默认值，`schema-sqlite.ts:87`），`hasRules` 为 false，`matched` 必为 null，端点级 `'{}'` 恒胜。e2e/openapi.spec.ts 只验证导入计数、未验证 mock 返回内容，故未暴露。
**修复**：导入时 `endpoint.responseBody` 置 `null`，让 fallback 链路生效（配合 P1-3 一起修）。
**复核注记（三方分歧，维持原判）**：codex 认为"'{}' 只是末位 fallback、根因是 P1-1、修好 P1-1 本条自动消失"。经逐行复核：求值顺序是 matched → **端点级 responseBody（:206）** → responses fallback（:215），`'{}'` 在 fallback **之前**返回，与 P1-1 是否修复无关。`:205` 注释（"端点级 responseBody 作 fallback"）描述的是设计意图，代码顺序与意图不符。**P1-1 与本条相互独立，两条修复都必须做。**

**P1-3 默认响应（isDefault）选择逻辑有缺陷——可被无规则响应抢占**
`src/app/[project]/[...path]/route.ts:187-199`：fallback 先到先得——只要一个**非默认、无规则**的响应按 priority 排在 isDefault 响应之前，fallback 就被它占住，`isDefault` 标志不再兜底。而 responses GET 排序（`responses/route.ts:93`）明确"默认响应放最后"，设计意图是默认兜底，后端实现与之矛盾。
**复核注记（按 codex 弱化）**：对导入数据，responses priority 全为 0（`import/route.ts:118`），fallback 归属实际取决于存储顺序，非"恒失效"；但对 UI 创建的显式 priority 响应，抢占确定性触发，逻辑错误成立。
**修复**：fallback 分两个变量（`defaultResp`/`firstNoRule`），优先取 `defaultResp`。

### B. 数据完整性

**P1-4 SQLite 未开外键 → 级联删除全部失效**
`src/lib/db-sqlite.ts:20-23` 只设了 WAL，未执行 `PRAGMA foreign_keys = ON`（SQLite 默认 OFF，按连接生效）。`ON DELETE cascade`（`drizzle/0000_moaning_leopardon.sql:16,49`）不生效，删项目/端点后 endpoints/responses/requests 全成孤儿；MySQL 栈正常 → 双栈行为不一致。
**修复**：建连后加 `sqliteDb.pragma('foreign_keys = ON')`，并补一次性清理孤儿行的迁移。

**P1-5 404 请求记录（endpointId=NULL）永不查询、永不清理 → 表无限增长**
- mock 未命中写 `recordRequest(null, ...)`（`[project]/[...path]/route.ts:353-354`）；项目级 requests GET/DELETE 用 `inArray(endpointId, ids)`（`requests/route.ts:71,222-225`），NULL 行永不匹配；requests 表无 projectId 列，无法关联无法清理。
- `src/lib/request-retention.ts:43-48` 的自连接 `ON r2.endpoint_id = r1.endpoint_id` 对 NULL 永假 → NULL 行 COUNT 恒 0，永远排不进 keep 之后，**prune 对它们永不删除**。
- mock 面匿名可写（扫描器每请求一行），无任何保留策略 → 存储单调无限增长。与 P0-1 叠加形成持续写盘 DoS。

**修复**：prune 把 NULL 归并为虚拟桶（`ON (r2.endpoint_id = r1.endpoint_id OR (r2.endpoint_id IS NULL AND r1.endpoint_id IS NULL))`）或对 NULL 行按 created_at 截断；长期建议 requests 表加 projectId 列。

**P1-6 项目删除/停用/改名后缓存完全不失效**
`src/app/api/projects/[id]/route.ts` 的 PUT（`:106`）与 DELETE（`:150`）均未调用缓存失效；`invalidateProjectCache`（`project-cache.ts:37`）**全库 0 调用点**。后果：已删项目的 mock 继续公开服务最长 60s；`isActive=false` 关停、slug 改名同理（旧 slug 继续可用 60s）。
**修复**：PUT/DELETE 后调用 `invalidateProjectCache(oldSlug)`（改名连同旧 slug）+ `invalidateEndpointCache(projectId)`。多副本部署下本进程失效不传播（KVStore 预留 pub/sub 未接线），至少文档标明 60s 不一致窗口。

### C. API 校验

**P1-7 项目级 requests 分页参数零校验**
`src/app/api/projects/[id]/requests/route.ts:32-33`：`page`/`pageSize` 直接 `parseInt` 无上限无兜底。`?pageSize=10000000` 拉全表（DoS）；SQLite 下 `LIMIT -1` 语义是无上限，`?pageSize=-1` 同样拉全表；MySQL 下 `LIMIT -1` 直接 SQL 语法错误 → 500 且 `err.message` 透给客户端；`page=abc` → NaN → `offset(NaN)` 未定义行为。
**修复**：照抄端点列表路由写法：`Math.max(1, parseInt(...) || 1)`、`Math.min(Math.max(1, raw) || 20, 200)`。

**P1-8 GET /api/projects 分页 NaN 无兜底且 handler 无 try/catch**
`src/app/api/projects/route.ts:43-44`：`Math.max(1, parseInt('abc'))` = NaN（`Math.max` 遇 NaN 返 NaN）→ `.limit(NaN).offset(NaN)`。且 GET handler（`:30-54`）无 try/catch，异常冒泡成 Next 默认 500 HTML，破坏统一错误形状。
**修复**：加 `|| 1` / `|| 20` 兜底；补 try/catch。

**P1-9 端点路径无规范化校验：可创建永不匹配的端点**
`endpoints/route.ts:20` 与 `[endpointId]/route.ts:21` 的 zod 仅 `min(1).max(500)`：
- `users`（无前导斜杠）：`routeParts=['users']` vs `requestParts=['','users']` 长度不等（mock route.ts:251）→ 永不匹配；
- `/users/`（尾斜杠）：Next 默认 trailingSlash:false 将 308 到无斜杠形式，requestPath 不等 → 永不匹配；
- UI 只补前导斜杠，不处理尾斜杠；直接调 API 更无保护。

**修复**：POST/PUT schema 加 `.regex(/^\/\S*$/)` 且拒绝尾斜杠（或服务端规范化后落库）。

**P1-10 `malformed-json` 错误场景功能完全无效——实际返回合法 JSON**
`src/lib/error-scenarios.ts:120,239-248` 预设 body 为 `'{invalid json response}'`、contentType 为 `application/json`。mock 路由 `parseJsonSafe` 失败 → 返回原字符串 → `NextResponse.json(string)` 输出的是**合法 JSON 字符串**。客户端永远收不到 malformed JSON，该场景在任何情况下都达不到演练目的（e2e 只验 UI toast、未验 mock 输出，故未暴露）。
**修复**：body 为字符串时跳过 `NextResponse.json`，统一走 `new NextResponse(bodyText)` 原始文本分支。

### D. 前端

**P1-11 错误响应形状误用：settings 页白屏崩溃，导入/AI 弹窗显示 `[object Object]`**
服务端标准错误包络是对象（`src/lib/api.ts:40-46`：`{ success:false, error:{ code, message, details } }`；中间件 401 同形 `src/proxy.ts:33`），但多处前端按字符串用：
- `src/app/settings/ai/page.tsx:59-60`（及 `:103,125,144,163`）：`setLoadError(json.error || '加载失败')` —— `json.error` 是对象，作为 React child 渲染直接抛 "Objects are not valid as a React child"。全站无 error 边界 → 整个应用白屏。会话过期（401）或任意 500 即触发。
- `src/components/ImportOpenAPI.tsx:103-104,132-133`、`AiGenerateDialog.tsx:104-105`：`throw new Error(errorData.error || '...')` → `new Error(对象)` → 用户看到 `[object Object]`。OpenAPI 解析失败是最常见用户错误，提示完全失效。
- 注：`/api/ai/generate` 的 429 分支返回字符串 error（`route.ts:173-174`），服务端形状本身也不统一。

**修复**：统一写 `const msg = typeof json.error === 'string' ? json.error : json.error?.message || '失败'`，或复用 api-client 的 `ApiError`；settings 页补 401 跳登录；服务端统一错误形状。

**P1-12 公开分享页 `JSON.parse(endpoint.tags)` 无保护 → 公开页白屏**
`src/app/share/[slug]/page.tsx:45`：DB 中 tags 可能是非 JSON 字符串（端点编辑页 `parseTags` 注释 `:142` 明确历史上存在非数组数据）。`JSON.parse` 抛错 → 渲染期异常 → 无错误边界 → **未登录可见的公开分享页直接白屏**。即便 parse 成功，`JSON.parse('"abc"')` 返回字符串，`:144` 的 `tags.map` 同样崩。
**修复**：复用 `parseTags` 同款 try/catch + `Array.isArray` 校验。

**P1-13 标签输入框无法键入逗号分隔符**
`src/app/projects/[id]/endpoints/[endpointId]/page.tsx:725-732` 与 `endpoints/new/page.tsx:523-530`：受控值由数组派生，`onChange` 里 `split(',').filter(Boolean)` 每次按键后吞掉尾逗号 → 永远打不出第二个标签（仅粘贴可行）。placeholder 却写"用逗号分隔"。
**修复**：改独立字符串 state，blur/submit 时才 split/filter 归一化。

**P1-14 模型列表 textarea 实际上无法键入编辑**
`src/components/settings/AddProviderDialog.tsx:253-263`：受控值 `JSON.stringify(formData.models)`，编辑中间态恒为非法 JSON → parse 失败 → state 不更新 → 值回弹。**除整体粘贴外无法修改该必填字段**。且 `JSON.parse('{}')` 合法时会把 models 写成非数组对象，`ProviderList` 渲染 `models.length` 为 undefined（`:69`）。
**修复**：同 P1-13，字符串 state + blur/submit 时 parse 并校验 `Array.isArray`，失败给行内错误。

**P1-15 列表数据加载无竞态防护，旧响应可覆盖新数据**
`src/app/projects/[id]/page.tsx:452-464,492-548`、`projects/page.tsx:30-56`：快速翻页/连续改筛选/切换 projectId 时多个 `loadData` 并发在飞，**后完成的请求覆盖先完成的**，页面显示与当前页码/筛选不一致的旧数据。`endpointsApi.list`/`projectsApi.get` 等均不接受 `AbortSignal`。
**修复**：组件内加 `const reqIdRef = useRef(0)`，入口 `const id = ++reqIdRef.current`，await 后 `if (id !== reqIdRef.current) return;`（`projects/new/page.tsx:78-135` 有完整防抖+Abort+卸载清理样板可抄）。

**P1-16 未保存修改的离开防护覆盖不全**
`endpoints/[endpointId]/page.tsx:479-494` 只给面包屑和"取消"按钮挂了 `handleNavigate`；GlobalHeader（全站每页可见）的 Projects / AI Settings / New Project / logo 链接完全绕过检查，SPA 跳转不触发 `beforeunload`；浏览器后退（popstate）同样。新建端点页**完全没有** dirty 防护。
**修复**：新建页补 `beforeunload` + dirty 标记；GlobalHeader 链接统一走 guard；最低限度新建页与编辑页对齐。

**P1-17 切换 Content-Type 静默清空已编写的响应体**
`endpoints/[endpointId]/page.tsx:326-332`、`endpoints/new/page.tsx:163-169`、`ResponseRuleEditor.tsx:225-231`：`handleContentTypeChange` 无条件 `responseBody: DEFAULT_RESPONSES[...]`。一次误点 select 即销毁手写响应体，无确认无撤销。
**修复**：仅当当前 body 为空或等于某个 DEFAULT_RESPONSES 模板时才替换；否则保留原文（或弹确认）。

### E. 安全 / 可用性

**P1-18 SSRF：IPv6 link-local `fe80::/10` 未拦截（已实测）**
`src/lib/ssrf.ts:42-48` IPv6 分支只拦 `::1`、`::`、`fc00::/7`、`::ffff:a.b.c.d`，没有 `fe80::/10`。实测 `isPrivateIP('fe80::1') → false`、`validateUrlSafe('http://[fe80::1]/') → { safe: true }`。（IPv4-mapped IPv6 实测不能绕过，`dns.lookup` 归一化后被 regex 拦住。）
**修复**：IPv6 分支加 `if (normalized.startsWith('fe80')) return true;`。

**P1-19 限流对 Redis 运行时故障 fail-closed → 全站 500**
`src/lib/kv-store.ts:50-69` 只在初始化时 fallback Memory。运行中 Redis 挂掉后：`rate-limit.ts:35` `kv.incr()` 抛错 → `[project]/[...path]/route.ts:297` `await rateLimit(...)` 无 try/catch → 每个 mock 请求 500。Redis 网络分区 → mock 核心业务整体不可用。
**修复**：`rateLimit()` 包 try/catch，KV 错误时 fail-open（放行 + `logger.error` + 指标），与"限流是防滥用、不是可用性关键路径"的语义对齐。

---

## P2 — 改进建议

### 事务 / 并发

1. `src/app/api/ai/providers/route.ts:105-133`："清其它默认 + insert" 非事务，并发创建可留双默认；且 `body.isDefault` 用未校验的原始 body 字段（schema 未定义 isDefault）。
2. `src/app/api/ai/providers/[id]/default/route.ts:33-43`：clear-all + set-one 两步无事务，中途崩溃留"零默认"。
3. `src/app/api/ai/providers/[id]/route.ts:181-199`：DELETE 时"提升其它 provider 为默认 + 删除"非事务，删除失败则双默认。
4. `src/app/api/projects/route.ts:79-102`：slug 预检→insert 存在 TOCTOU，并发撞唯一索引返回 500 + 裸 SQL 错误（`UNIQUE constraint failed: projects.slug`）而非 409。`PUT /api/projects/[id]` 同理。建议 catch 约束冲突转 `Errors.conflict`。
5. `src/lib/kv-store.ts:50`：`getKv()` 并发首调竞态，可能创建两个 Redis client（连接泄漏）。加 in-flight Promise 缓存。
6. `src/lib/backup.ts:35-36`：文件名秒级精度，同秒并发两个 POST → 同路径冲突；无互斥。
7. 项目级/端点级 requests DELETE：count-then-delete 非原子，返回的 `deleted` 可能偏小（可接受近似，建议注释或包事务）。

### 输入校验

8. `src/app/api/projects/check-slug/route.ts:18-20`：只校验 `min(1).max(255)`，不校验 `SLUG_REGEX`，上限 255 与 `MAX_SLUG_LENGTH=100` 不一致 → `check-slug?slug=AbC` 报 available，创建时被 regex 拒，结果误导。
9. `src/app/api/projects/[id]/endpoints/[endpointId]/route.ts:148-169`：PUT 改 path/method 无重复预检（POST 有），撞唯一索引 → 500 裸错。
10. `src/app/api/projects/[id]/endpoints/[endpointId]/responses/route.ts:25`：`body: z.any()` 无大小限制，与 endpoints 路由的 1MB refine 不一致。
11. `src/app/api/projects/[id]/endpoints/route.ts:67`：LIKE 的 `%`/`_` 通配符未转义，搜索 `100%` 会匹配全部（参数化无注入，纯匹配语义瑕疵）。
12. 多参数模式命中选择不确定（mock route.ts:248-260）：`getCachedEndpointsByMethod` 的 SQL 无 `ORDER BY`，`/:type/list` 与 `/admin/:page` 同时命中时结果依赖存储顺序。加 `ORDER BY created_at` 或按字面段数排序（具体度优先）。
13. priority 并列时响应选择不定（mock route.ts:181）：`orderBy(desc(priority))` 无次级键。加 `, responses.createdAt`。
14. inactive 精确端点屏蔽 active 参数端点（mock route.ts:240）：`if (!exactMatch.isActive) return null` 直接 404，不再尝试模糊匹配。建议 inactive 视为不存在继续参数匹配。

### import / 解析边界

15. `import/route.ts:166-174` 与 `import/parse/route.ts:31-39`：上传文件无大小上限，`file.text()` 整文件读内存；解析端点数无上限，批量 insert 单条 SQL 在 ~2500+ 端点时超 SQLite `MAX_VARIABLE_NUMBER` 整批失败。建议限文件大小（如 5MB）+ insert 分块。
16. **已实证**：YAML 锚点/别名造循环对象 → `import/route.ts:115` 的 `JSON.stringify(response.body)` 与 `import/parse/route.ts:69` 的序列化必抛 → 两个路由 500。应在 parse 层检测循环并返回 400。
17. `import/route.ts:194-197`：批量 insert 整体失败时仍返回 HTTP 201（errors 仅在 body），语义应为 207/500。
18. `openapi-parser.ts:92`：`{"$ref":"#"}` 或 `"#/"` → parts 为空 → `resolveRefs(自身)` 无限递归 → RangeError（目前被 try/catch 兜住）。修复：parts 为空直接返回原节点。

### 错误处理 / 信息泄露

19. 全局惯例 `Errors.internal(err.message)`（十余处）把内部异常原文（含 SQL 错误、文件路径）透给客户端。管理面需登录风险有限，建议生产环境只返固定文案、细节进 logger。
20. `src/app/api/projects/[id]/route.ts:140-146`：demo 保护返回的 error 是**字符串**而非统一的 `{code,message}` 对象，破坏错误形状契约。
21. `src/app/api/health/ready/route.ts:25,40`：公开路由把 DB/FS 异常 message 直接输出给匿名访问者（低危信息泄露）。
22. `src/app/api/ai/providers/[id]/route.ts:72,127`：`JSON.parse(existing.models)` 无 try/catch（A18 修复遗漏点），坏 models 数据会让 PATCH 500。
23. `src/app/api/ai/providers/[id]/test/route.ts:77`：models 坏数据被修成空数组后 `modelToTest` 可能为 undefined 直接发给 OpenAI → 不友好的上游 400，应前置校验。
24. `src/app/api/ai/providers/route.ts:96-98`：`select({ count: aiProviders.id })` 拉全量 id 仅为判空，应 `limit(1)`；命名误导。
25. `src/app/api/projects/route.ts:39 vs 48`：无分页 `desc(createdAt)`、有分页 `asc(createdAt)`，排序方向不一致。

### 安全（低危 / 纵深）

26. **SSRF DNS rebinding TOCTOU**（`src/lib/ssrf.ts:98`）：校验时 `dns.lookup` 一次，OpenAI SDK 连接时重新解析。攻击者控制权威 DNS（TTL=0）可在第二次解析返回 `169.254.169.254` → 云元数据凭证经 `Authorization` 头发往内网。短期在注释中标注限制；根治需把解析结果 pin 到连接层（自定义 dispatcher）或重定向目标二次校验。另建议 SDK 初始化设 `fetchOptions: { redirect: 'manual' }`（undici 跨 origin 重定向是否剥 Authorization **待验证**）。
27. 内网段缺口：`100.64.0.0/10`（CGNAT，Tailscale 在用）、`198.18.0.0/15`、`224.0.0.0/4`、`240.0.0.0/4` 未覆盖（`src/lib/ssrf.ts:8-21`）。按需补 CGNAT。
28. **`X-Real-IP`/`X-Forwarded-For` 无条件信任**（`src/lib/client-ip.ts:13-27`）：直连部署（无反代覆写）时客户端可自造 IP 轮换 → login/AI/mock 限流全部失效可暴破 MANAGE_TOKEN。注释已声明 trusted proxy 前提，建议加 `TRUST_PROXY` 显式开关并在 DEPLOY 显著标注。**影响程度依赖部署形态，待验证具体环境。**
29. `src/lib/encryption.ts:61-72`：`deriveKeyCache` 无淘汰上限（encrypt 每次随机 salt 新增一条，长命进程缓慢泄漏），建议 LRU 上限；`ENCRYPTION_KEY` 无强度校验（`"x"` 也接受），建议启动时校验最小长度 ≥16。
30. `src/app/api/share/[slug]/route.ts:58-59`：`baseUrl` 取自请求 Host 头，可被 Host 头污染（仅影响展示字符串，React 转义，低危）。
31. mock 路由 `sanitizeHeaders` 名单偏窄（`[project]/[...path]/route.ts:29`）：`proxy-authorization`、`x-forwarded-for` 等未脱敏即落库。

### 可用性 / 可观测性

32. `src/lib/kv-redis.ts:70-72`：`incr(key, by>1, ttlSec)` 走 `incrby` **不设 EXPIRE** → `ai-budget.ts:80` 的 token 预算 key 永不过期（每日新 key，正确性不受影响，但每天泄漏 1 个永久 key）。修复：`incrby` 后 `if (after === by) EXPIRE`（Lua 化）。
33. `src/lib/backup.ts:60`：`BACKUP_KEEP=0` 会把刚创建的备份也一并删掉（slice(0) 全删），极易误配。建议 0 时拒绝备份或显式 warn。
34. `src/lib/db-sqlite.ts`：未设 `busy_timeout` pragma，多进程并发会偶发 SQLITE_BUSY。建议 `pragma('busy_timeout = 5000')`。
35. `src/instrumentation.ts:14-15`：`startOtelIfConfigured()` 无 try/catch，OTLP 配置错误导致 exporter 构造抛错 → 启动失败。建议 catch 降级为"OTel 禁用 + error log"。另 OTel 只能 patch 其启动后 require 的模块（**待验证**排序风险）；http instrumentation 会把完整 URL（含 query）写进 span attribute，mock 请求 query 可能含敏感数据流向 tracing 后端。
36. 多处 `console.error('Error ...', err)`（如 `generate/route.ts:208`、`providers/route.ts:61`、`request-retention.ts:58`）绕过 pino redact，建议统一走 `logger.error`。
37. `src/lib/rate-limit.ts:38`：`resetAt = Date.now() + window` 对固定窗口不精确，仅影响 429 响应头展示。
38. mock 路由非 Latin-1 路径/自定义头值导致 500（`[project]/[...path]/route.ts:391,396-400`）：`X-Mock-Endpoint: <path>` 及用户自定义响应头若含中文等字符，undici Headers 抛 TypeError 未捕获 → 裸 500。
39. contentType 精确比较（mock route.ts:431）：`application/json; charset=utf-8` 落入非 JSON 分支，对象 body 经 `String()` 变 `"[object Object]"`。建议解析 media type，非 JSON 分支保留原始字符串。
40. prune 自连接 O(N²) + 同步驱动阻塞事件循环（`request-retention.ts:39-50`）：better-sqlite3 同步驱动，表大后全表扫描每 10 分钟变慢。改窗口函数（SQLite 3.25+ / MySQL 8 均支持 ROW_NUMBER）或按 created_at 简单截断。
41. endpoint-cache 内存膨胀：缓存整行含 responseBody（单端点可达 1MB）按 (project,method) 全量驻留；并发 miss 无单飞。建议缓存时剥离 responseBody。
42. `getCachedProject` 不缓存负结果（`project-cache.ts:29`）：不存在 slug 每次打 DB，有限流兜底影响小。
43. 错误场景 headers 预设被丢弃（`error-scenarios.ts:317-327`）：`ApplyScenarioResult` 不含 headers，503 的 `Retry-After`、401 的 `WWW-Authenticate` 应用时静默丢失；`network-error` 实际返回正常 503 JSON，名不副实。

### 前端

44. `src/app/projects/[id]/page.tsx:517-518`：`setError` 只在 catch 中调用，成功路径没有 `setError(null)`——瞬时失败后红色横幅常驻；首屏失败一律显示"项目不存在"且无重试按钮（端点编辑页 `:530-541` 有样板可抄）。
45. `src/lib/api-client.ts:204,207-211`：非 JSON 错误体（网关 HTML 错误页）`response.json()` 抛原始 SyntaxError 丢失状态码语义；整个 client 无超时（fetch 挂起 → spinner 永久转）；401 跳转 `/login` 丢 `from` 回跳参数（登录表单本来就支持 `from`）。
46. `src/components/ResponseRuleEditor.tsx:207-223,707-719`：删除规则无防重复提交（ConfirmDialog 未传 `confirmDisabled`），双击发两个 DELETE → 成功 toast 后又弹"规则不存在"。
47. `ImportOpenAPI.tsx:170-175`、`AiGenerateDialog.tsx:142-147`：请求进行中取消按钮禁用了，但 Escape 和 backdrop 点击没有禁用——导入中途关窗，fetch 无 Abort 仍在执行，用户以为已取消端点却被导入。
48. `src/app/projects/page.tsx:35-56`：visibilitychange 刷新时 `setLoading(true)` 走整页骨架，每次切回标签整页闪白。详情页已有 `loadedOnce`/`reloading` 局部 spinner 模式可复用。
49. share 页两处小 bug：`:208-210` `queryParams` 初始 `{}`（truthy）→ `fullUrl` 恒带尾部 `?`；`:577-582` `showToast` 的 setTimeout 无清理，连续复制时提前清掉新 toast。
50. `src/app/projects/[id]/page.tsx:531-542`：请求记录 tab 每次翻页都 `endpointsApi.list(projectId)`（pageSize 1000）仅为填充下拉框，应仅首次拉一次。
51. 弹窗交互补漏：`EditProjectDialog`/`RequestDetailDialog`（`[id]/page.tsx:144-216,226-368`）无 `role="dialog"`/`aria-modal`、无 Escape、无焦点管理，保存中可点 backdrop 关窗；`ErrorScenariosSelector.tsx:215` 预览弹窗无 Escape/backdrop；`ProviderList.tsx:94-98` 用原生 `confirm()`，与全局 ConfirmDialog 风格不一致。
52. JsonEditor 两处：`:171-181` 外部 value 变化整篇替换文档，光标跳文末、撤销历史断档（可用 `view.state.update` 保留 selection 映射）；`:27` linter 错误定位依赖 V8 报错文案 `position (\d+)`，Firefox 下恒落位置 0（**待验证**）。
53. **全站无路由级错误边界**：`src/app` 下无 `error.tsx`/`global-error.tsx`/`not-found.tsx`，P1-11/P1-12 这类渲染期异常爆炸半径是全站白屏。加一个最小 `error.tsx`（含 reset）即可显著降损。
54. lint warning：`src/app/settings/ai/page.tsx:87` `react-hooks/exhaustive-deps` 缺 `loadProviders` 依赖。
55. query 重复 key last-wins（mock route.ts:287-289）：`?a=1&a=2` 时 matchRule 只见 `a=2`，文档未说明。

---

## 排查过但没有问题的面（确认健康）

- **鉴权**：proxy matcher 正向白名单覆盖全部 `/api/projects` 与 `/api/ai`，fail-closed；登录 timing-safe + 限流 + 防开放重定向；session 为 HMAC 签名 cookie（httpOnly+sameSite=lax+secure(prod)+path=/）；metrics/backup 用独立 token 且未配置时 503 fail-closed；logout 不可即时吊销系 AUTH-DESIGN.md 明文记录的 tradeoff。单管理员模型（MANAGE_TOKEN），嵌套路由 projectId/endpointId/responseId 归属校验逐条核对无遗漏。
- **保留 slug 冲突**（项目名叫 api/share/login）：`src/lib/slug.ts:17` 的 `RESERVED_SLUGS` 覆盖全部顶层路由段，创建与改名后端均拦截。
- **XSS**：全代码库无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`；mock 响应体、请求 body/headers 均以 React 文本子节点渲染自动转义；动态 href 强制 `window.location.origin` 前缀。
- **延迟注入**：setTimeout 是 await 的，delayMs API 层有 60s 上限，无资源泄漏。
- **metrics label**：无 path/project label，基数安全；logger redact 覆盖面到位。
- **share 访问控制**：按 slug 公开是设计如此，`isShareable` 过滤正确，不扩大攻击面。
- 代码库实际未使用 Hono（package.json 有依赖但 src 无引用），与 CLAUDE.md 技术栈描述不符，建议更正文档或移除依赖。

## 待验证项汇总

- MySQL 栈 `` sql<number>`count(*)` `` 的返回类型（mysql2 默认转 number，大概率无恙）
- drizzle `.offset(NaN)` 的确切行为（无论抛错还是静默，P1-7/P1-8 均成立）
- Next 16 对 route handler 尾斜杠 308 重定向的确切行为（影响 P1-9 触发路径，无斜杠 split 不匹配是代码层面确定的）
- `X-Real-IP` 在目标部署环境是否被反代覆写（P2-28）
- 多副本部署形态（缓存跨实例失效窗口，P1-6）
- undici 跨 origin 重定向是否剥 Authorization 头（P2-26）
- OTel auto-instrumentation 对 `register()` 前已加载模块的覆盖（P2-35）
- OpenAI APIError 对象是否可能含 apiKey（P2-36）
- JsonEditor linter 在 Firefox 下的错误定位（P2-52）
- **`drizzle/0001+` 迁移文件与 `schema-sqlite.ts`/`schema-mysql.ts` 的同步性**（codex 补充，低概率遗留；建议 `drizzle-kit generate` 空跑对比或人工 diff 一次）

## 建议修复顺序

1. **P0-1**（流式 body 守卫；注意与 P2-28 的协同，限流不能当代修）
2. **导入链三件套**：P1-1（`$ref` root）+ P1-2（导入 responseBody 置 null）+ P1-3（isDefault 选择）。**三者相互独立，缺一不可**——codex 认为 P1-2 随 P1-1 修复自动消失，经逐行复核不成立（见 P1-2 复核注记）
3. **数据完整性**：P1-4（一行 pragma）+ P1-5（404 记录清理）+ P1-6（缓存失效接线）
4. **前端稳定性**：P1-11（错误形状统一，含补 `error.tsx`）+ P1-12（share 页 tags 保护）
5. **安全/可用性**：P1-19（限流 fail-open）+ P1-18（fe80）+ P1-7/P1-8（分页校验，有现成写法可抄）
6. P2 批量收尾：优先 1/4/6/7（事务与冲突错误形状）、15/16（import 边界）、45（api-client 健壮性）、53（错误边界）
