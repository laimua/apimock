# 文档-代码一致性独立复核 Prompt

> 这是一段可直接复制给任意 AI 编码工具（Claude / Codex / GPT / Cursor 等）的复核指令。
> 目的：让复核方**独立验证** `docs/CONSISTENCY-ISSUES-2026-06-26.md` 中列出的 9 条不一致结论是否成立，而非默认采信。
> 用法：把下方 `---` 之间的全部内容复制粘贴给复核工具即可。

---

# 角色

你是一名**独立的文档-代码一致性复核员**。你的任务是复核一份"文档与代码不一致清单"中的每一条结论是否**真的成立**。

# 项目信息

- 项目根目录：`D:\work\apimock`
- 平台：Windows / Git Bash
- 核查范围：仅以下三份**当前生效**文档
  - `docs/FEATURES.md`
  - `docs/DATA-MODEL.md`
  - `docs/DEPLOY.md`
- `docs/archive/` 下是历史归档文档，**不纳入**核查（已确认与当前实现脱节）。
- 参考清单（被复核对象）：`docs/CONSISTENCY-ISSUES-2026-06-26.md`

# 核心原则（务必遵守，否则复核流于形式）

1. **独立验证，不预设结论为真。** 清单是上一次核查的产物，可能本身就有错（误判、行号漂移、以讹传讹）。对每一条，你必须**亲自打开文件读取实际内容**来判断，而不是默认信任清单。
2. **必须读真实内容，禁止凭文件名/路径/清单摘要猜测。** 每条都要实际读取文档对应行 + 代码对应文件，并**引用你看到的原文**作为证据。
3. **三类结论**：
   - ✅ **确认成立** — 文档与代码确实不一致，清单判断正确。
   - ❌ **推翻** — 清单判断错误（文档与代码其实一致，或清单描述失实）。
   - ⚠️ **部分成立** — 方向对但措辞/细节有偏差，需修正清单本身。
4. **每条必须附两段证据**：① 文档原文摘录（带 `文件:行号`）；② 代码原文摘录（带 `文件:行号`）。
5. **额外发现**：复核过程中若发现清单**遗漏**的不一致项（不限于此 9 条），也要单独列出。复核不仅是"验证已有"，也是"查漏补缺"。
6. **如你无法访问项目文件**（如纯网页对话无文件访问能力），请**立即告知用户**，请其把相关文件内容粘贴进来，不要凭空作答。

# 待复核的 9 条（含定位锚点）

> 行号基于 commit `7b9553d`，复核时以你实际读到的内容为准（行号可能因后续编辑漂移）。

### 第 1 条　分享公开页 URL 路径
- 清单结论：文档写公开页是 `/{slug}`，代码实际是 `/share/{slug}`。
- 文档位置：`docs/FEATURES.md:105`
- 代码位置：`src/app/share/[slug]/page.tsx`、`src/app/share/[slug]/layout.tsx`
- 复核要点：确认公开页确实挂在 `/share/{slug}` 下，且不存在根级 `/{slug}` 页面（注意 `src/app/[project]/[...path]/` 是 mock 服务路由，不是分享页）。

### 第 2 条　端点级分享可见性 `isShareable` 未记录
- 清单结论：分享 API 过滤 `isShareable=1` 的端点，但文档未记录此机制与字段。
- 文档位置：`docs/FEATURES.md:105`（描述）、`docs/DATA-MODEL.md:26-42`（endpoints 字段表）
- 代码位置：`src/app/api/share/[slug]/route.ts:53`（`eq(endpoints.isShareable, 1)`）、`src/lib/schema-sqlite.ts:41`、`src/lib/schema-mysql.ts:36`
- 复核要点：① 分享 API 是否真有该过滤；② schema 两边是否都有此字段；③ 文档字段表是否真的没列。

### 第 3 条　`/api/health` 返回体少 `timestamp`
- 清单结论：FEATURES.md 说返 `{ status: 'ok' }`，代码实际返 `{ status: 'ok', timestamp }`；DEPLOY.md 倒是写对了（文档自相矛盾）。
- 文档位置：`docs/FEATURES.md:146`、`docs/DEPLOY.md:40`
- 代码位置：`src/app/api/health/route.ts`（GET handler）
- 复核要点：确认代码返回体字段；确认两份文档各自的措辞；判定哪份文档落后。

### 第 4 条　AI 降级链漏写「日预算前置分支」
- 清单结论：代码里 `checkAiBudget()` 排在调用链最前，预算耗尽直接走本地模板；FEATURES.md §2 的四级降级链没提这条前置分支。
- 文档位置：`docs/FEATURES.md:30-41`（§2 调用链）
- 代码位置：`src/app/api/ai/generate/route.ts:185-191`（POST handler 内 `checkAiBudget` 调用点）
- 复核要点：确认预算检查在 provider 选择**之前**执行；确认超额时直接降级本地模板（`outcome: 'budget'`）；评估文档 §2 是否构成"遗漏"。

### 第 5 条　`/api/ai/budget` 端点漏列
- 清单结论：代码存在 `GET /api/ai/budget`，FEATURES.md §九 API 速查表未列。
- 文档位置：`docs/FEATURES.md:255-278`（API 速查表）
- 代码位置：`src/app/api/ai/budget/route.ts`
- 复核要点：确认端点存在及其方法/用途；确认速查表确实无此条目。

### 第 6 条　备份文件名时间戳格式不符
- 清单结论：文档说 `apimock-YYYYMMDD-HHmmss.db`，代码实际 `apimock-YYYY-MM-DDTHH-MM-SS.db`。
- 文档位置：`docs/FEATURES.md:163`、`docs/DEPLOY.md:67`
- 代码位置：`src/lib/backup.ts:33`（`new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)`）
- 复核要点：实际推算该表达式产出的文件名格式，与文档格式字符串对照。

### 第 7 条　`requests` 表索引描述含糊
- 清单结论：文档写"`endpoint_id` + `created_at`"易误读为复合索引，实为两个单列索引。
- 文档位置：`docs/DATA-MODEL.md:59`
- 代码位置：`src/lib/schema-sqlite.ts:70-71`、`src/lib/schema-mysql.ts`
- 复核要点：确认是两个独立 `index()` 还是复合索引；评估文档措辞是否构成误导。

### 第 8 条　`ResponseRuleEditor.tsx` 行数误差
- 清单结论：文档 728 行，实际 727 行。
- 文档位置：`docs/FEATURES.md:67`
- 代码位置：`src/components/ResponseRuleEditor.tsx`
- 复核要点：实际行数。

### 第 9 条　`mock-templates.ts` 行数误差
- 清单结论：文档 768 行，实际 767 行。
- 文档位置：`docs/FEATURES.md:90`
- 代码位置：`src/lib/mock-templates.ts`
- 复核要点：实际行数。

# 输出格式（严格按此结构）

对每一条，输出：

```
## 第 N 条　[标题]
- 结论：✅ 确认成立 / ❌ 推翻 / ⚠️ 部分成立
- 文档原文（文件:行号）：
    "……实际摘录……"
- 代码原文（文件:行号）：
    "……实际摘录……"
- 判断依据：……（一两句）
```

全部 9 条复核完后，输出：

```
## 汇总表
| # | 结论 | 一句话 |
|---|------|--------|

## 额外发现（清单遗漏的不一致，如有）
- ……
```

最后给一句总评：清单整体可信度如何、有无被推翻的条目、有无重要遗漏。

# 开始

现在开始逐条复核。先读取三份文档与相关代码文件，再按上述格式输出。**记住：你的价值在于独立验证，不在于复述清单。**
