# 任务：独立复核功能缺陷修复报告

你是独立第三方审查者。请对齐人类已完成的复核，给出你自己的结论，不要轻信任何一方。

## 复核目标

报告：`docs/ISSUES-REVIEW-2026-06-23.md` 声称：

1. FUNCTIONAL-DEFECTS.md 列的 19 项功能缺陷「全部已修复」（commit `ae282c0`）
2. 仍存在 P0：slug 从不提交 + CJK 项目名生成空 slug
3. 仍存在 P1：改名无条件覆盖 slug
4. `tsc=0 错误` / `vitest=296 passed` / `eslint=0 errors 1 warning`

## 你必须独立做的事

### A. 运行验证命令（不要相信报告数字）

```bash
npx tsc --noEmit
npx vitest run
npx eslint "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"
```

数字对不上就明确说报告造假。

### B. 逐条核验 P0/P1 slug（报告「仍然存在」的部分）

打开源码确认：

| 文件 | 验证点 |
|---|---|
| `src/lib/api-client.ts` | `CreateProjectDto`(51-55) / `UpdateProjectDto`(84-89) 是否真的没有 slug 字段 |
| `src/app/api/projects/route.ts` | `CreateProjectSchema`(18-22) 是否接受 slug；POST(63-66) 是否用 name 生成、正则是否 `[^a-z0-9]+/g`（CJK 被剥光 → 空 slug） |
| `src/app/api/projects/[id]/route.ts` | PUT(68-75) 是否 `name` 变化就无条件覆盖 slug；UpdateProjectSchema 是否无 slug 字段 |
| `src/app/projects/new/page.tsx` | 前端 handleSubmit(220-223) 是否只提交 name/description，slug 是否死代码 |

### C. 抽查「已修复」至少 5 项

| # | 验证点 |
|---|---|
| #6 分享页受控展开 | `src/app/share/[slug]/page.tsx` 是否有 `expandedDetailId`/`expandedTestId` state；子组件是否受控；是否还有 `document.querySelectorAll` / `.click()` 残留 |
| #15 端点级 isShareable | `src/lib/schema-sqlite.ts` 是否有 `isShareable` 列 DEFAULT 1；`drizzle/0003_is_shareable.sql` 内容；`src/app/api/share/[slug]/route.ts` 是否 `eq(endpoints.isShareable, 1)` 过滤 |
| #7 AI toast | `src/app/settings/ai/page.tsx` 5 个 handler catch 是否都调 toastError；是否有 loadError + 重试 UI |
| #1 常驻按钮 | `src/app/projects/[id]/page.tsx` 端点列表标题栏右侧是否有常驻「导入 OpenAPI」+「添加端点」按钮组 |
| #14 预算 | `src/app/api/ai/budget/route.ts` 是否存在；`settings/ai/page.tsx` 是否展示 budget 卡片 |
| #19 copyToClipboard catch | `projects/[id]/page.tsx` catch 是否调 toastError；`share/[slug]/page.tsx` catch 是否 showToast error |

### D. 报告遗漏项核对

人类复核指出报告**范围外**遗漏了 `FEATURE-AUDIT-REPORT.md` 的另 3 个 P1，请打开源码确认这 3 项是否真的仍然存在：

1. `src/app/api/projects/[id]/route.ts:42` GET 返回 isActive 整数（无 `Boolean()` format，对比 `api/projects/route.ts:33-34` 的 format 函数）
2. `src/app/projects/[id]/page.tsx:468` 等三处仍用 `projectsApi.list().then(find)` 而非 `projectsApi.get(id)`
3. slug 保留字（api/share/settings 等）在 `src/app/api/projects/check-slug/route.ts` 是否拦截

## 输出格式（强制）

```
## codex 独立复核结论

### 验证命令实测结果
- tsc: <实测结果>
- vitest: <实测 passed/failed 数>
- eslint: <实测 errors/warnings 数>

### P0 slug 报告结论是否准确
<准确/不准确> + 源码证据

### P1 改名覆盖 slug 报告结论是否准确
<准确/不准确> + 源码证据

### 19 项「已修复」抽查
<逐项 PASS/FAIL + 源码证据>

### 报告遗漏项核对
1. isActive 整数: <存在/不存在>
2. 全量拉取: <存在/不存在>
3. 保留字拦截: <存在/不存在>

### 与人类复核不一致的地方（如有）
<列出分歧，双方证据对比>

### 最终结论
<报告整体可信/部分可信/不可信，一句话>
```

## 铁律

- 不要看人类的复核结论，自己读源码
- 数字必须实测，禁止「应该是」
- 发现报告错就明确说错，不要客气
- 发现人类复核错也明确说，不要盲从
