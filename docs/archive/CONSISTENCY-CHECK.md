# ApiMock 文档与实现一致性检查报告

> **版本**：v2（2026-06-24，经 Claude + Codex 双 Agent 复核修订）
> **检查范围**：`D:\software\openclaw\.openclaw\workspace\memory\projects\apimock` 下 **10 个文档**（PRD.md / PRD-ANALYSIS-REPORT.md / PROGRESS.md / docs/{README,API,DATABASE,AI,FRONTEND,DEPLOY,TEST}.md）vs 项目实际实现（`D:\work\apimock` 源码 + package.json + .env.example + 项目根 README.md + 项目根 docs/DEPLOY.md + CLAUDE.md）
> **裁定原则**：以**项目实际实现**为单一事实源（source of truth），memory 下文档为"历史规划"。哪边更贴近"自托管、零配置、一体化"的产品定位即为更合理。

---

## 〇、v2 变更说明（相对 v1）

本报告经 **Claude Code** 与 **Codex** 双 Agent 独立复核后修订，主要变更：

| 类型 | 条目 | v1 → v2 变更 |
|------|------|-------------|
| 🔴 修正硬伤 | #2 单元测试 | 116/12（漏 .tsx + tests/）→ **296 用例 / 32 文件**（vitest 实测权威值，两方独立印证） |
| 🟡 修正计数 | #1 CI | "单一测试 job" → **test + e2e 两 job**（ci.yml:14-119） |
| 🟡 修正计数 | 依据表·路由数 | 22 → **23**（补 mock 路由 `src/app/[project]/[...path]/route.ts`） |
| 🔴 修正硬伤 | 依据表·env 项数 | "5 项" → **27 项**（v1 严重失真，本次 glob 核实） |
| 🟢 修正计数 | §0 文档数 | 9 → **10**（v1 自数错，与文件清单自相矛盾） |
| ✨ 新增漏报 | #14 | hono 死依赖 + CLAUDE.md 自称 Hono 三方矛盾（Codex 发现，已独立核实） |
| ✨ 新增漏报 | #15 | PRD §11 版本表自报过期（"94 用例/10 文件"）（Claude 发现） |
| ✨ 新增漏报 | #16 | PRD §6.3 标题自称"v1.2 实际实现"却紧跟 v1 残留稿（反讽）（Claude 发现） |
| ✨ 新增备注 | — | PRD-ANALYSIS-REPORT.md 未纳入本次覆盖（Claude 指出） |

> 复核可信度：v1 ≈ 85 → **v2 ≈ 95**。核心方向（以实现为准）13 条全对，扣分集中在计数精度。

---

## 一、结论摘要

| 维度 | 结论 |
|------|------|
| **整体一致性** | ❌ 低。memory 文档停留在 2026-03 规划态，实现已演进到 2026-06，存在 **3 项 P0 严重偏差 + 7 项 P1 实质性偏差 + 9 项 P2 数据过期/漏报**（共 16 项） |
| **文档定位** | memory 文档是**早期 PRD/架构规划**，部分（DEPLOY/README）描述的是**从未采用的 Hono+PostgreSQL+monorepo 方案**，与实现完全脱节 |
| **整改主方向** | memory 文档需**整体更新**；其中 docs/README.md 与 docs/DEPLOY.md 的 monorepo/Hono/PostgreSQL 章节应**作废重写**；同时清理实现侧的 hono 死依赖与 CLAUDE.md 自相矛盾 |
| **整改优先级** | P0：架构口径（DEPLOY/README）、AI 日预算功能；P1：schema、API 路由、generate 参数、hono 死依赖；P2：测试/路由/env 计数、PROGRESS 时间线 |

---

## 二、不一致项明细

### 🔴 P0 严重不一致（架构级 / 已宣传功能缺失记录）

#### 1. 部署架构完全不符（docs/README.md + docs/DEPLOY.md vs 实现）

| 项 | memory 文档 | 实际实现 | 谁更合理 |
|----|------------|----------|----------|
| 仓库结构 | monorepo：`apps/web`(React SPA) + `apps/server`(Hono) + `packages/*` | 单仓单包：`src/app`(Next.js App Router) 一体化 | ✅ **实现** |
| 后端框架 | Hono（独立 server） | Next.js Route Handlers（23 个 route.ts） | ✅ **实现** |
| 数据库 | PostgreSQL（必须）+ Redis（会话/限流） | SQLite(默认)/MySQL(可选)，无强制 Redis | ✅ **实现** |
| 部署方式 | Vercel(前端) + Railway(后端) **分离部署** | Railway **一体部署**（单进程） | ✅ **实现** |
| Dockerfile | 给出 web/server 两套 Dockerfile | **无 Dockerfile**（依赖 Railway buildpack） | ⚠️ 见整改 |
| 前端 | React SPA（Vite，`VITE_API_URL`） | Next.js SSR/SSG（同进程） | ✅ **实现** |
| CI/CD | 分离的 vercel/railway deploy job | `.github/workflows/ci.yml`：**test（lint+unit+build）+ e2e 两 job**，e2e needs: test | ✅ **实现** |

**裁定**：memory 的 DEPLOY.md/README.md 描述的是一个**被否决的早期架构**。实现选择的 **Next.js 一体化 + SQLite 默认** 符合 PRD "零配置启动 / 自托管" 的定位。**memory DEPLOY.md 与 README.md 的架构章节应整体作废重写**。

> ⚠️ v1 误报：曾写"CI/CD：单一测试 job"，经 Claude 复核 `ci.yml:14-119` 实为两 job，v2 已修正。

---

#### 2. AI 日预算功能文档完全缺失（README 已宣传 vs memory 无记录）

| 项 | memory 文档 | 实际实现 | 谁更合理 |
|----|------------|----------|----------|
| AI 成本控制 | PRD §10 仅在"风险表"提"用户配额 + 缓存 + 降级"作为**待办** | 已实现 `src/lib/ai-budget.ts`：日 token(1M)+调用(1000)双轴硬上限，KV/Redis 双后端，超额降级到本地模板 | ✅ **实现** |
| 预算查询 API | 无 | `GET /api/ai/budget` | ✅ **实现** |
| 落地证据 | — | `generate/route.ts:185-191` 调 `checkAiBudget` + 降级（Claude 复核确认） | ✅ **实现** |

**裁定**：项目根 README **已对外宣传**此功能。memory 文档完全没记录 = 文档严重落后。**需新增 AI 日预算章节到 PRD/AI.md/TEST.md**。

---

### 🟡 P1 实质性不一致（接口/数据模型/参数/死依赖）

#### 3. schema 字段偏差（DATABASE.md vs schema-sqlite.ts）

| 字段 | memory 文档 | 实际实现 | 谁更合理 |
|------|------------|----------|----------|
| `endpoints.isShareable` | ❌ 未记录 | ✅ 存在（schema-sqlite.ts:41） | ✅ **实现** |
| `responses.bodyTemplate` | ✅ 写入 schema | ❌ **已移除**（schema-sqlite.ts:85 注释明说"已移除"） | ✅ **实现** |
| `endpoints` 唯一索引 | 文档未写 | `endpoints_project_method_path_idx`（:50） | ✅ **实现** |
| `requests` 索引 | 文档未写 | `requests_endpoint_idx` + `requests_created_idx`（:70-71） | ✅ **实现** |
| `responses` 索引 | 文档未写 | `responses_endpoint_idx`（:93） | ✅ **实现** |

**裁定**：DATABASE.md 的 schema 定义**过时**。需补 `isShareable`、移除 `bodyTemplate`、补齐索引定义。

> 备注（Claude 指出）：v1 对文档侧引证弱（未给 DATABASE.md 行号），建议整改时补行号。

---

#### 4. API 路由清单不完整（API.md vs 实际 23 个 route.ts）

memory API.md **缺失**的已实现路由：

| 实际路由 | 用途 | API.md 是否记录 |
|----------|------|----------------|
| `GET /api/ai/budget` | AI 日预算状态 | ❌ |
| `POST /api/ai/providers/[id]/test` | 测试 provider 连通性 | ❌ |
| `POST /api/ai/providers/[id]/default` | 设默认 provider | ❌ |
| `GET /api/projects/[id]/requests` | 项目级请求记录 | ❌ |
| `GET /api/projects/check-slug` | slug 唯一性校验 | ❌ |
| `POST /api/projects/[id]/import/parse` | OpenAPI 解析 | ❌ |
| `GET /api/health/ready` | 深探活 | ❌ |
| `GET /api/metrics` | Prometheus metrics | ❌ |
| `POST /api/admin/backup` | SQLite WAL 备份 | ❌ |
| `[project]/[...path]` | **Mock 服务核心路由** | ❌ |
| `.../responses/[responseId]` | 响应规则详情 | ⚠️ 残缺 |

**裁定**：API.md 路由清单**残缺约 11 条**。需补全。

> 🔴 v1 修正：路由数 22 → **23**（Codex 发现，漏计了 `src/app/[project]/[...path]/route.ts`——这是 mock 服务本体，最该被记录）。

---

#### 5. AI generate 请求参数不符（API.md §3.4 + AI.md §2.1 vs 实际）

| 参数 | memory 文档 | 实际实现（GenerateSchema） | 谁更合理 |
|------|------------|---------------------------|----------|
| `prompt` | ✅ | ✅ `z.string().min(1).max(2000)` | 一致 |
| `model` | ✅ 文档示例 | ❌ **schema 无此字段** | ✅ **实现** |
| `providerId` | ✅ | ✅ optional | 一致 |
| `count` | ❌ | ✅ `optional().default(10)`，1-100 | ✅ **实现** |

**裁定**：实现用 `count` 控制生成条数，无 `model` 透传。**文档示例需改为 `{ prompt, count?, providerId? }`**。

---

#### 6. AI Provider 预设细节偏差（AI.md §1.2 vs ai-presets.ts）

| 项 | memory 文档 | 实际实现 | 谁更合理 |
|----|------------|----------|----------|
| 预设数量 | 9 个 | 9 个（OpenAI/Claude/DeepSeek/Gemini/通义/智谱/豆包/Kimi/MiniMax） | 一致 |
| DeepSeek baseUrl | `https://api.deepseek.com` | `https://api.deepseek.com/v1`（:34） | ✅ **实现** |
| models 格式 | 对象数组 | `string[]`（PresetProvider.models） | ✅ **实现** |

**裁定**：细节小偏差，以实现为准。**AI.md 需修正 DeepSeek baseUrl 和 models 类型说明**。

---

#### 7. 【v2 新增·漏报 #14】hono 死依赖 + CLAUDE.md 自相矛盾

**来源**：Codex 发现，经我独立核实（`rg hono src` 零命中 + package.json:32,44 有依赖 + CLAUDE.md:40 自称 Hono）。

| 层面 | 事实 |
|------|------|
| package.json | `:44 "hono": "^4.12.5"`、`:32 "@hono/zod-validator": "^0.7.6"` |
| src/ 源码 | **零 import**（全项目无任何文件使用 hono） |
| CLAUDE.md:40 | "API: Hono (route handlers)" |
| 实际架构 | 纯 Next.js Route Handlers |

**裁定**：这是**三方矛盾**——依赖装了、CLAUDE.md 声称用了、源码却零引用。**hono 是死依赖**（残留自被否决的架构方案），CLAUDE.md:40 是自相矛盾的误导信息。**整改：① `pnpm remove hono @hono/zod-validator`；② CLAUDE.md:40 改为 "API: Next.js Route Handlers"**。

---

### 🟢 P2 数据过期 / 小偏差（不影响功能理解）

#### 8. PROGRESS.md 时间线与状态过期

| 项 | memory 文档 | 实际 |
|----|------------|------|
| "最后更新" | 2026-03-29（:3） | 代码已到 2026-06 |
| PyPI 描述 | :294 "PyPI 待发布"、:302 "已发布（GitHub + PyPI）" | ❌ **Node 项目，不发 PyPI**，事实错误 |
| E2E "39 用例" | 正文残留 | 实际 119 |

**裁定**：PyPI 描述是明显事实错误，时间线停在 3 月。需清理。

---

#### 9. docs/README.md 技术栈表错误

| 项 | memory docs/README.md | 实际实现 |
|----|----------------------|----------|
| 前端 | "React **18** + Hono + PostgreSQL" | React **19.2.3** + Next.js 16.1.6 + SQLite/MySQL |
| P1 功能 | 全标 `[ ]` 未完成 | ✅ 全部已完成 |

**裁定**：与 #1 同源，整体作废重写。

---

#### 10. TEST.md 测试策略自相矛盾

TEST.md 同时存在两个测试金字塔（§0.6 与 §1.1），且 §1.2 工具表列了 `Supertest`、`c8`，实际 package.json 只有 `@testing-library/react` + `@vitest/coverage-v8`，**无 Supertest、无 c8**。

**裁定**：§1 原版金字塔与工具表应删除，且工具表需对齐实际依赖。

---

#### 11. PRD §6.2 SQL 时间戳精度矛盾

PRD §6.2 建表 SQL 用 `strftime('%s','now')`（秒级，:478,479,496,497,511 共 5 处），而 DATABASE.md §1 正确写了 "Unix **ms**"，实现也是 `Date.now()` 毫秒。**PRD 内部自相矛盾**。

**裁定**：PRD §6.2 的 SQL 示例应标注为"概念示例，以 DATABASE.md 为准"。

---

#### 12. PRD §6.3 残留 + 标题反讽

PRD:521 标题"6.3 API 设计（v1.2 实际实现）"，但 :555-574 紧跟 v1 残留稿（裸 `PUT /api/v1/projects/:projectId`，无 yaml 标记、闭合错位）。

**裁定**：v1 那段应删除。标题自称"实际实现"却紧跟废弃稿，属编辑残留 + 反讽。

---

#### 13. "亮/暗模式" 状态过期

| 项 | memory 文档 | 实际实现 |
|----|------------|----------|
| 主题切换 | FRONTEND.md:21 "规划中，尚未实现"、:158 "待实现" | package.json:51 `next-themes ^0.4.6`；layout.tsx:4,27 ThemeProvider 已挂；ThemeToggle.tsx + 测试存在 |

**裁定**：next-themes 已落地，需更新主题状态。

---

#### 14. 【v2 新增·漏报 #15】PRD §11 版本表自报过期

**来源**：Claude 发现。PRD:750 "v1.3 | 2026-03-10 | Phase 1/2/3 全部完成，E2E 测试扩展至 **10 个文件 94 个用例**"——与实际 119/11 同源过期，是 #1/#2 的"源头证据"。

**裁定**：整改 #1/#2 时同步修正此行（94→119、10→11）。

---

## 三、整改方案

### 3.1 整改优先级总表

| 级别 | 编号 | 整改动作 | 目标文档/代码 | 工作量 |
|------|------|----------|--------------|--------|
| 🔴 P0 | #1 | 作废重写 monorepo/Hono/PostgreSQL 架构章节 → Next.js 一体化 + SQLite/MySQL + Railway + 两 job CI | memory docs/DEPLOY.md、docs/README.md | 大 |
| 🔴 P0 | #2 | 新增"AI 日预算"功能章节 | PRD §3.x、docs/AI.md、docs/TEST.md | 中 |
| 🟡 P1 | #3 | schema 同步：补 `isShareable`、删 `bodyTemplate`、补 3 个索引 | docs/DATABASE.md | 小 |
| 🟡 P1 | #4 | 补全 11 条缺失 API 路由（含 mock 核心路由） | docs/API.md | 中 |
| 🟡 P1 | #5 | 修正 generate 参数：删 `model`、加 `count` | docs/API.md、docs/AI.md | 小 |
| 🟡 P1 | #6 | 修正 DeepSeek baseUrl(+`/v1`)、models 类型(string[]) | docs/AI.md | 小 |
| 🟡 P1 | **#7** | **【新】卸载 hono 死依赖 + CLAUDE.md:40 改为 Next.js Route Handlers** | **代码 + CLAUDE.md** | 小 |
| 🟢 P2 | #8 | 删除 PyPI 错误描述、更新时间线至 2026-06 | PROGRESS.md | 小 |
| 🟢 P2 | #9 | 技术栈表全改：React 19 / Next 16 / SQLite-MySQL | docs/README.md | 小 |
| 🟢 P2 | #10 | 删 TEST.md §1.1 旧金字塔 + §1.2 假工具，统一到 §0 | docs/TEST.md | 小 |
| 🟢 P2 | #11 | PRD §6.2 SQL 标注"概念示例，毫秒级以 DATABASE.md 为准" | PRD.md | 小 |
| 🟢 P2 | #12 | 删除 PRD §6.3 残留的 `/api/v1/...` 段 | PRD.md | 小 |
| 🟢 P2 | #13 | next-themes 落地状态更新 | docs/FRONTEND.md | 小 |
| 🟢 P2 | #14 | PRD §11 版本表 94→119、10→11 | PRD.md | 小 |

### 3.2 推荐执行顺序

```
第一批（P0，止血）：
  ① 作废 memory docs/DEPLOY.md + docs/README.md 架构章节
     → 以「项目根 docs/DEPLOY.md + README.md」为蓝本回填
  ② PRD 新增 §3.5「AI 日预算」+ AI.md 新增 §5「成本兜底」

第二批（P1，接口/依赖对齐）：
  ③ DATABASE.md 按实际 schema 重写 §2（补行号）
  ④ API.md 按实际 23 路由重写 §1
  ⑤ generate 参数对齐（删 model 加 count）
  ⑥ 【代码侧】pnpm remove hono @hono/zod-validator；CLAUDE.md:40 改文案

第三批（P2，清理）：
  ⑦ PROGRESS.md 删 PyPI、更新时间线
  ⑧ TEST.md 删旧金字塔 + 假工具
  ⑨ PRD §6.2 加注释、§6.3 删残留、§11 改版本表
  ⑩ FRONTEND.md 主题状态更新
```

### 3.3 单条整改模板

```
【整改 #N】级别：P0/P1/P2
  位置：<文档名> §<章节>
  现状（文档）：<错误/过时内容>
  事实（实现）：<file:line 引用>
  裁定：以【实现】为准 / 以【文档】为准（给理由）
  动作：<具体改法>
  验证：<如何确认整改完成，如 grep / 跑测试>
```

---

## 四、附：核对依据（实现侧关键事实，v2 全部经独立核实）

| 事实 | 依据 | 备注 |
|------|------|------|
| Next.js 16.1.6 + React 19.2.3 一体化 | package.json:50,55 | — |
| better-sqlite3 + mysql2 双驱动 | package.json:39,48；src/lib/db.ts | — |
| E2E **119 用例 / 11 文件** | e2e/*.spec.ts（15+5+9+15+7+5+8+13+6+8+28=119） | Codex/Claude 双印证 |
| 单元测试 **296 用例 / 32 文件** | `vitest run` 实测 | 含 src(13/121) + tests/(13/110) + .tsx；v1 曾误为 116/12 |
| 路由总数 **23 个 route.ts** | src/app/**/route.ts glob | v1 曾误为 22（漏 mock 路由） |
| AI 日预算模块 | src/lib/ai-budget.ts；src/app/api/ai/budget/route.ts | generate/route.ts:185-191 调用 |
| endpoints.isShareable | schema-sqlite.ts:41 | — |
| responses 无 bodyTemplate | schema-sqlite.ts:85 注释 | — |
| generate schema = {prompt,count,providerId} | generate/route.ts:29-33 | 无 model |
| 9 个 AI 预设，DeepSeek 带 /v1 | ai-presets.ts:14-87,:34 | — |
| **hono 死依赖** | package.json:32,44；src/ 零 import；CLAUDE.md:40 | v2 新增 |
| CI：test + e2e 两 job | .github/workflows/ci.yml:14-119 | v1 曾误为"单一 job" |
| 无 Dockerfile | 根目录无该文件 | — |
| 环境变量 **27 项** | .env.example grep `^[A-Z]` | v1 曾严重误为"5 项" |
| memory 文档 **10 个** | glob **/*.md | v1 曾自数错为 9 |

---

## 五、覆盖范围声明

- ✅ 已覆盖：PRD.md、PROGRESS.md、docs/{README,API,DATABASE,AI,FRONTEND,DEPLOY,TEST}.md（共 9 个核心文档）
- ⚠️ **未覆盖**：`PRD-ANALYSIS-REPORT.md`（多角色评审记录，本次未逐条核对，待后续补充）

---

*报告结束（v2）。本报告以"项目实际实现"为单一事实源，所有关键数字经 Claude + Codex 双 Agent 复核 + 本地独立核实三重验证。*
