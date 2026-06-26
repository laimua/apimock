# 文档与代码一致性核查清单

> 核查日期：2026-06-26
> 核查范围：`docs/` 下三份**当前生效**文档 — `FEATURES.md`、`DATA-MODEL.md`、`DEPLOY.md`
> 对照基准：`src/` 源码（commit `7b9553d`）
> 说明：`docs/archive/` 为历史归档，不反映当前实现，未纳入核查。
> 修订：2026-06-26 经独立复核（清单整体可信度 ~92%，0 条推翻，10 条方向全正确），应用 delta 修正：5 项初次 delta + 2 项二次微调 + 新增第 11 条。当前共 11 条（🔴×3 / 🟡×3 / ⚪×5）。
> **状态：✅ 已修复（2026-06-27）**——11 条全部落地，第三方复核验收通过（11/11 正确、0 返工、0 引入新错误）。本文件为修复记录，保留备查。

本清单供**第三方工具独立复核**使用。每条给出：文档原文位置 → 代码定位点（文件:行号）→ 差异描述 → 建议方向。所有行号均可直接定位验证。

---

## 复核方法

1. 读文档对应行，确认文档原文。
2. 读代码对应文件:行号，确认实现。
3. 对照"差异"列判断。
4. 严重度：🔴 实质不一致（描述与实现不符，或遗漏完整机制） / 🟡 遗漏或措辞不准（影响理解但不误导行为） / ⚪ 计数级误差或措辞建议（可忽略）。
5. **行数核对注意**：组件行数须用原始字节 `\n` 计数，勿用 PowerShell 的 `Measure-Object -Line`（CRLF 文件会折叠计数，读成偏低值，如 727 误读为 668）。

---

## 不一致项

### 🔴 1. 分享公开页 URL 路径写错 + 端点级分享可见性机制未记录

**这是最需要复核的一条**——代码实现了一个文档完全未体现的可见性开关。

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:105` | "项目生成可分享的只读公开页 `/{slug}` 及 API `/api/share/{slug}`。" |
| 代码实际 | `src/app/share/[slug]/page.tsx`、`src/app/share/[slug]/layout.tsx` | 公开页实际路径是 **`/share/{slug}`**，非 `/{slug}` |

**差异**：文档写的公开页 URL `/{slug}` 与代码 `/share/{slug}` 不符。

**复核指引**：
```bash
# 确认公开页实际挂在 /share 下
ls src/app/share/[slug]/     # 存在 page.tsx + layout.tsx
# 确认根级 /{slug} 路由不存在（只有 /{project}/{path} 的 mock 路由）
ls "src/app/[project]/[...path]/"  # 这是 mock 服务，不是分享页
```

---

### 🔴 2. 端点级分享可见性（`isShareable`）机制完全未记录

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:105` | "分享页与数据接口只返回公开字段，不含敏感信息。"（暗示全量端点公开） |
| 文档原文 | `docs/DATA-MODEL.md:26-42` | `endpoints` 字段表**未列出** `isShareable` 字段 |
| 代码实际 | `src/app/api/share/[slug]/route.ts:53` | `eq(endpoints.isShareable, 1)` —— 分享 API **额外过滤**只返回 `isShareable=1` 的端点 |
| 代码实际 | `src/lib/schema-sqlite.ts:41`、`src/lib/schema-mysql.ts:36` | `isShareable: integer('is_shareable').notNull().default(1)` |

**差异**：
- 代码实现了**端点级分享可见性开关**（`isShareable`，默认 1=可见），分享 API 只返回可见端点。
- FEATURES.md 把它描述成无差别的"全部公开只过滤敏感字段"。
- DATA-MODEL.md 的 endpoints 字段表遗漏该字段。
- 注：README 在提交 `3a40513` 已补"端点级分享可见性"，说明此特性是真实存在的，`docs/` 落后于 README。

**复核指引**：
```bash
grep -n "isShareable" src/lib/schema-sqlite.ts src/lib/schema-mysql.ts src/app/api/share/[slug]/route.ts
grep -n "isShareable" docs/FEATURES.md docs/DATA-MODEL.md   # 文档侧应为空
```

---

### 🔴 3. `/api/health` 返回体：FEATURES.md 与代码不符（且两份文档互相矛盾）

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:146` | "Liveness：`GET /api/health` → `200 { status: 'ok' }`" |
| 文档原文 | `docs/DEPLOY.md:40` | "`/api/health` 返回 `{ status: 'ok', timestamp: '...' }`" |
| 代码实际 | `src/app/api/health/route.ts`（GET handler，约第 13-16 行） | 返回 `{ status: 'ok', timestamp: <ISO string> }` |

**差异**：
- 代码与 DEPLOY.md 一致（都带 `timestamp`）。
- **FEATURES.md 落后**：少了 `timestamp` 字段。
- 同时两份文档彼此矛盾。

**复核指引**：
```bash
# 读 health route 的 NextResponse.json 体
grep -n "status" src/app/api/health/route.ts
grep -n "timestamp" src/app/api/health/route.ts
```

---

### 🟡 4. AI 生成降级链漏写「日预算前置分支」

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:30-41`（§2 调用链） | 列出四级降级：指定 Provider → 默认 Provider → OPENAI_API_KEY → 本地模板。**未提预算检查。** |
| 代码实际 | `src/app/api/ai/generate/route.ts:185-191`（POST handler） | `checkAiBudget()` 排在调用链**最前**；日预算耗尽时**直接**走本地模板（`outcome: 'budget'`），不经过任何 provider。 |

**差异**：FEATURES.md §2 的降级链没串入"日预算耗尽先降级"这条前置分支。（注：§六"AI 成本预算"小节有讲预算概念，但 §2 的调用链描述未与之衔接，读者会把降级链理解为纯四级。）

**复核指引**：
```bash
grep -n "checkAiBudget\|outcome.*budget" src/app/api/ai/generate/route.ts
```

---

### 🟡 5. `/api/ai/budget` 端点未列入 API 速查表

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:255-278`（§九 API 速查表） | 表中**无** `/api/ai/budget` 条目 |
| 代码实际 | `src/app/api/ai/budget/route.ts` + `src/lib/ai-budget.ts:85`（`getBudgetStatus`） | 端点存在，`GET /api/ai/budget`，返回 `{ date, requests, tokens, reqLimit, tokLimit }`（当日 UTC 累计消耗 + 两条上限，扁平结构） |

**差异**：API 速查表漏列该端点。

**复核指引**：
```bash
ls src/app/api/ai/budget/    # 存在 route.ts
grep -n "budget" docs/FEATURES.md
```

---

### 🟡 6. SQLite 备份文件名时间戳格式不符

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:163`、`docs/DEPLOY.md:67` | "`./data/backups/apimock-YYYYMMDD-HHmmss.db`"（例：`apimock-20260626-123456.db`） |
| 代码实际 | `src/lib/backup.ts:33` | `new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)` → 实际形如 `apimock-2026-06-26T12-34-56.db`（带 `T`，日期带连字符，**UTC 时间**） |
| 根因 | `src/lib/backup.ts:8` | JSDoc 注释写 `备份输出：./data/backups/apimock-YYYYMMDD-HHmmss.db`，与第 33 行实际产物矛盾 |

**差异**：实际格式为 `apimock-YYYY-MM-DDTHH-MM-SS.db`，与文档 `apimock-YYYYMMDD-HHmmss.db` 不符。根因是源码注释本身也写错（`backup.ts:8`），文档照搬了错误注释。

**复核指引**：
```bash
grep -n "stamp\|toISOString\|\.db\|YYYYMMDD" src/lib/backup.ts
```

**修复注意**：修复时必须一并改 `backup.ts:8` 的 JSDoc 注释，否则下次同步文档会反复回弹。

---

### ⚪ 7. `requests` 表索引描述含糊（易误读为复合索引）

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/DATA-MODEL.md:59` | "索引：`endpoint_id` + `created_at`。" |
| 代码实际 | `src/lib/schema-sqlite.ts:70-71`、`src/lib/schema-mysql.ts:65-66` | 两个**独立单列索引**：`index('requests_endpoint_idx').on(table.endpointId)` 与 `index('requests_created_idx').on(table.createdAt)` |

**差异**：文档措辞"`endpoint_id` + `created_at`"易被误读为 `(endpoint_id, created_at)` 复合索引。实为两个单列索引（MySQL schema 同，`schema-mysql.ts:65-66`）。

---

### ⚪ 8. `ResponseRuleEditor.tsx` 行数误差

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:67` | "前端编辑器 `ResponseRuleEditor.tsx`（728 行）" |
| 代码实际 | `src/components/ResponseRuleEditor.tsx` | 727 行 |

**差异**：差 1 行。可忽略，或改为不写具体行数。

---

### ⚪ 9. `mock-templates.ts` 行数误差

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:90` | "`mock-templates.ts`（768 行）" |
| 代码实际 | `src/lib/mock-templates.ts` | 767 行 |

**差异**：差 1 行。可忽略，或改为不写具体行数。

---

### ⚪ 10. API 速查表 Mock 行用 `{slug}` 占位（与第 1 条混淆同源）

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:257` | API 速查表首行 `ANY /{slug}/{path}`（Mock 服务） |
| 代码实际 | `src/app/[project]/[...path]/route.ts` | Mock 路由按 `[project]` 段（即 slug）匹配，URL 确为 `/{slug}/{path}`，路径无误 |

**差异**：此处 `{slug}` 作 Mock 路径占位符，语义尚可。但与第 1 条的分享页 `/{slug}` 用同一字面量，读者易混淆二者。建议统一表述：Mock 行注明"项目 slug"，分享页改用 `/share/{slug}` 后即不再冲突。

**复核指引**：
```bash
grep -n "{slug}/{path}\|/{slug}" docs/FEATURES.md
```

---

### 🟡 11. 备份相关环境变量（`BACKUP_DIR` / `BACKUP_KEEP`）未文档化

| | 位置 | 内容 |
|---|---|---|
| 文档原文 | `docs/FEATURES.md:163`、`docs/DEPLOY.md:223-239`（环境变量速查表） | 备份输出路径写死为 `./data/backups`，保留份数写死为 7；环境变量速查表**无** `BACKUP_DIR` / `BACKUP_KEEP` 条目 |
| 代码实际 | `src/lib/backup.ts:17-18` | `const BACKUP_DIR = process.env.BACKUP_DIR \|\| './data/backups';`、`const KEEP_COUNT = Number(process.env.BACKUP_KEEP) \|\| 7;` —— 两者均可环境变量覆盖 |

**差异**：代码支持通过环境变量自定义备份目录与保留份数，文档将两者表述为固定值（"输出 `./data/backups/...`""滚动保留默认 7 份"），未提及可配置性。属功能描述遗漏，非行为不符。

**复核指引**：
```bash
grep -n "BACKUP_DIR\|BACKUP_KEEP" src/lib/backup.ts
grep -n "BACKUP_DIR\|BACKUP_KEEP" docs/FEATURES.md docs/DEPLOY.md   # 文档侧应为空
```

---

## 汇总

| # | 严重度 | 一句话 | 涉及文档 |
|---|---|---|---|
| 1 | 🔴 | 分享公开页 URL `/{slug}` 应为 `/share/{slug}` | FEATURES.md |
| 2 | 🔴 | `isShareable` 端点级可见性机制 + 字段未记录 | FEATURES.md、DATA-MODEL.md |
| 3 | 🔴 | `/api/health` 返回体少 `timestamp` | FEATURES.md |
| 4 | 🟡 | AI 降级链漏写预算前置分支 | FEATURES.md |
| 5 | 🟡 | `/api/ai/budget` 端点漏列 | FEATURES.md |
| 6 | 🟡 | 备份文件名时间戳格式不符（根因：`backup.ts:8` 注释也错） | FEATURES.md、DEPLOY.md |
| 7 | ⚪ | requests 索引描述含糊 | DATA-MODEL.md |
| 8 | ⚪ | ResponseRuleEditor 行数 728→727 | FEATURES.md |
| 9 | ⚪ | mock-templates 行数 768→767 | FEATURES.md |
| 10 | ⚪ | API 速查表 Mock 行 {slug} 占位与分享页混淆同源 | FEATURES.md |
| 11 | 🟡 | 备份环境变量 BACKUP_DIR/BACKUP_KEEP 未文档化 | FEATURES.md、DEPLOY.md |

**修正方向建议**：以代码为基准更新文档（文档跟随实现）。其中 #1、#2、#3 为优先项。对于 #8、#9 这类"活文档写死组件行数"，建议直接删除具体行数（728/768），改用描述性措辞（如"较大组件"），从源头消除每次代码改动即漂移的维护负担。

---

## 附录：已核查通过项（确认一致，无需复核）

以下项已逐条核实，文档与代码完全一致，列出以供随机抽检：

- 预置 AI 服务商 9 家（id 列表齐全）
- provider enum 三值 `openai/anthropic/openai-compatible`
- AI 降级链主体顺序 + `OPENAI_FALLBACK_MODEL` 默认 `gpt-4o-mini`
- AI 限流 10 req/min/IP；Mock 限流 100 req/min/IP
- AI 日预算默认值 100万 tokens / 1000 requests
- 错误场景 12 种 / 4 类（server/client/timeout/network），403/401/503 头部细节
- OpenAPI 导入：detectFormat / resolveRefs（未找到保留 $ref）/ 含 trace / summary||operationId 命名 / 两步导入 / 批量去重
- Mock 路由两级匹配（精确 + 参数 `:param`）、TTL 缓存、CORS、`X-Mock-*` 响应头、过滤 `access-control-*`
- 请求记录异步写入（`after()`）、敏感头脱敏、`getClientIp` 取 `X-Real-IP`/XFF 链尾、保留策略（每端点 1000 条 / 10 分钟）
- encryption v2 `salt:iv:authTag:encrypted`（16字节随机salt）/ v1 兼容 / scrypt 缓存 / `ENCRYPTION_KEY` 缺失报错
- SSRF 拦截（10/8、172.16/12、192.168/16、127/8、169.254/16、0/8、IPv6 loopback、IPv4-mapped、localhost/metadata.google.internal；仅 http/https）
- 固定窗口限流双后端（Memory / Redis 原子 INCR+EXPIRE）
- body 大小守卫 1MB（content-length 快速路径 + JSON 二次校验）
- 7 个 Prometheus 指标名全部存在
- `/api/health/ready`（DB select 1 + SQLite 才探 fs，失败 503）
- `/api/metrics`（Bearer/`?token=`，未配 503）
- `/api/admin/backup`（X-Admin-Token，未配 503，WAL 快照，滚动保留 7 份，GET 查状态）
- projects / responses / ai_providers 表字段、默认值、FK cascade 均一致
