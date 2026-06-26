# 功能缺陷修复复核报告

> 复核时间：2026-06-23
> 复核范围：对照 `FUNCTIONAL-DEFECTS.md`（19 项缺陷）+ `FUNCTIONAL-DEFECTS-IMPL.md`（实现规格）+ `FEATURE-AUDIT-REPORT.md`（审计报告），逐条核验当前源码。
> 复核方法：阅读全部相关源码文件，运行 `tsc --noEmit`、`vitest run`、`eslint src/ tests/`，比对实现与规格。

---

## 一、验证手段与结果

| 检查项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过，0 错误 |
| 单元测试 | `npx vitest run` | 296 passed (32 files) |
| 源码 Lint | `npx eslint 'src/**/*.{ts,tsx}' 'tests/**/*.{ts,tsx}'` | 0 errors, 1 warning |
| Git 状态 | `git status` | 干净工作区 |

说明：全仓 `npx eslint`（不带路径）会扫到 `.next/` 构建产物，报约 149 errors（`@typescript-eslint/no-this-alias` 等），这些来自打包压缩后的 chunk，**不是源码问题**。限定 `src/` + `tests/` 后为 0 错误。

---

## 二、FUNCTIONAL-DEFECTS.md 19 项复核结论

结论：**全部 19 项已修复**，均已在源码中确认。修复提交为 `ae282c0`（feat: 19 项页面功能缺陷修复 + 端点级分享可见性）。

| # | 严重度 | 缺陷 | 状态 | 证据 |
|---|---|---|---|---|
| 1 | P0 | 项目详情页常驻「添加端点」+「导入」入口 | 已修复 | `projects/[id]/page.tsx` 端点列表标题栏右侧有常驻按钮组（导入 OpenAPI + 添加端点） |
| 2 | P0 | 新建端点页补 AI 生成 / 模板库 / 错误场景 | 已修复 | `endpoints/new/page.tsx` import 了 AiGenerateDialog / TemplateLibraryDialog / ErrorScenariosSelector，响应数据 label 右侧有两个按钮，表单内挂载了 ErrorScenariosSelector |
| 3 | P1 | 端点表单补 tags 编辑 | 已修复 | 新建页和编辑页表单均有 tags 输入框（逗号分隔），submit DTO 带 tags |
| 4 | P1 | QUICK_ERROR_SCENARIOS 数值对齐 | 已修复（保守版） | 编辑页 QUICK_ERROR_SCENARIOS 超时项已改为 statusCode:408 / delayMs:30000，与 lib 一致 |
| 5 | P1 | 编辑按钮 ?edit=true 消费 | 已修复 | `projects/[id]/page.tsx` 用 useSearchParams 读取 edit=true，useEffect 触发 setIsEditDialogOpen(true)，已包 Suspense |
| 6 | P1 | 分享页详情/测试按钮改受控展开 | 已修复 | `share/[slug]/page.tsx` 用 expandedDetailId/expandedTestId state 受控，子组件接收 isExpanded/onToggle props，无 document.querySelectorAll / .click() 残留 |
| 7 | P1 | AI 设置页操作失败加 toast | 已修复 | `settings/ai/page.tsx` 引入 useToast，5 个 handler 的 catch 均调用 toastError，loadProviders 失败设 loadError state 并显示重试 UI |
| 8 | P3 | 删除分享页冗余 noindex useEffect | 已修复 | page.tsx 中无 robots 注入逻辑；layout.tsx 保留静态 metadata.robots |
| 9 | P2 | 路径参数格式校验 | 已修复 | 新建页 + 编辑页 validatePath 均校验 `:[a-zA-Z_][a-zA-Z0-9_]*` 段 |
| 10 | P2 | 编辑页 tags 入口 | 已修复 | 随 #3 一并 |
| 11 | P2 | 请求记录端点下拉补全 | 已修复 | `projects/[id]/page.tsx` 有 requestFilterEndpoints state，loadRequests 单独拉全量端点列表 |
| 12 | P2 | slug 正则统一（仅前端） | 已修复 | generateSlug 改为 `/[^a-z0-9]+/g`，不再保留中文 |
| 13 | P2 | 首页 demo 修正 | 已修复 | `page.tsx` 域名改 localhost:3000，响应体为 `{code,message,data:{list,total}}` 结构 |
| 14 | P2 | AI 设置页展示日预算 | 已修复 | 新增 `api/ai/budget/route.ts`，设置页显示今日用量卡片（requests / tokens） |
| 15 | P2 | 分享页端点级可见性 | 已修复 | schema 加 isShareable 列（DEFAULT 1），migration 0003，API schema 支持，share route 过滤 `eq(endpoints.isShareable, 1)`，表单有开关 |
| 16 | P3 | 新建端点页 Mock URL 复制 | 已修复 | URL 预览框内有「复制」按钮，用 copyToClipboard |
| 17 | P3 | 描述长度强制 | 已修复 | `projects/new/page.tsx` 有 validateDescription，500 字符上限 |
| 18 | P3 | title 统一 | 已修复 | 首页移除 'use client' 和 document.title，统一用 layout 的英文静态 title |
| 19 | P3 | copyToClipboard 假成功 | 已修复 | 项目详情页 catch 调 toastError；分享页 showToast(..., 'error') |

---

## 三、仍然存在的问题（需进一步处理）

### [P0] slug 从不提交 + 纯中文/CJK 项目名生成空 slug

这是 `FEATURE-AUDIT-REPORT.md` 的头号 P0。`FUNCTIONAL-DEFECTS-IMPL.md` 在 #12 明确标注「本条只统一前端，底层问题不在本批范围，需单独决策」。复核确认：**该底层问题原封未动**。

**根因链路**：

1. 前端 `CreateProjectDto` / `UpdateProjectDto`（`src/lib/api-client.ts:51,84`）没有 slug 字段。新建项目页精心做的 slug 输入 + 去重校验 UI 是「死」的，提交时只发 name/description，从不发 slug。
2. 后端 `CreateProjectSchema`（`src/app/api/projects/route.ts:11`）只有 name/description/basePath，不接受 slug。
3. POST handler 用 name 重新生成 slug（`route.ts:41-45`）：`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`。
4. 对纯中文/CJK 项目名（如「用户系统」），上述正则把所有字符替换掉 → 产出空字符串 → 写入空 slug。
5. 空 slug 导致 Mock URL `/{slug}/{path}` 变成 `//{path}`，项目 Mock 服务不可访问。

**影响**：纯中文/CJK 项目名的项目创建后核心功能（Mock 访问）断裂。

**建议修复点**：
- `CreateProjectDto` / `UpdateProjectDto` 加 `slug?: string` 字段
- `CreateProjectSchema` / `UpdateProjectSchema` 加 `slug: z.string().regex(/^[a-z0-9-]+$/).optional()`
- POST handler 优先用提交的 slug，为空时才用 name 生成；生成的 slug 仍为空则返回校验错误（拒绝创建空 slug 项目）
- 对 slug 做唯一性检查（撞 UNIQUE 约束时返回友好错误而非 500）
- 前端 `projectsApi.create` 把 form.slug 传入 DTO

### [P1] 改项目名会静默覆盖 slug（所有 Mock URL 失效）

`src/app/api/projects/[id]/route.ts:88-93` 的 PUT handler：只要 `data.name` 变化，就无条件重新生成并覆盖 slug。

**后果**：
- slug 是 Mock URL 前缀，改名 = 所有已集成的客户端 URL 立即失效，且无任何提示
- 详情页编辑弹窗只让用户改 name/description，用户意识不到改名会改 URL
- 更新时不做 slug 唯一性检查：两个项目改成同名 → 同 slug → 撞 UNIQUE 约束 → 500 错误

**建议**：改名为默认不覆盖已有 slug；如需改 slug 应由显式 slug 字段控制。这条应与上面 P0 一并修复（同一条 slug 数据流）。

### [低] 编辑页 QUICK_ERROR_SCENARIOS 仍是内联双份数据（可选）

`src/app/projects/[id]/endpoints/[endpointId]/page.tsx` 顶部仍有一份独立的 `QUICK_ERROR_SCENARIOS` 常量（带 icon 字段），与 `src/lib/error-scenarios.ts` 的 `ERROR_SCENARIOS` 重复。

#4 选了「保守版」（数值已对齐），功能正确，但仍是双份维护。`FUNCTIONAL-DEFECTS-IMPL.md` 标注「彻底版有图标陷阱，可选」。不修不影响功能。

---

## 四、仓库卫生（非缺陷文档范围，建议清理）

仓库根目录有一批临时调试文件，未在 `.gitignore` 中：
`check-db.mjs`、`test-api-endpoint.mjs`、`test-db-insert.mjs`、`test-insert.mjs`、`test-resolve.js`、`test-select.mjs`、`test-output.txt`、`nul`（Windows 保留名误建）、`local.db`、`test.db`、多个 `memory-*.db`。

建议删除或加入 `.gitignore`，避免污染仓库。

---

## 五、优先级建议

1. **立即修复**：P0 slug 提交链路 + P1 改名覆盖 slug（同一条数据流，一并修）
2. **可选**：编辑页错误场景去重（彻底版）
3. **清理**：根目录临时调试文件

---

## 六、关键文件索引

| 文件 | 关联问题 |
|---|---|
| `src/lib/api-client.ts` | P0 slug（DTO 无 slug 字段） |
| `src/app/api/projects/route.ts` | P0 slug（POST 不接受 slug，name 生成） |
| `src/app/api/projects/[id]/route.ts` | P1 改名覆盖 slug |
| `src/app/projects/new/page.tsx` | P0 slug（前端校验 UI 但不提交） |
| `src/app/projects/[id]/endpoints/[endpointId]/page.tsx` | 低：QUICK_ERROR_SCENARIOS 双份 |
| `drizzle/0003_is_shareable.sql` | #15 migration |
| `src/app/api/share/[slug]/route.ts` | #15 share route 过滤 |
| `src/app/api/ai/budget/route.ts` | #14 预算 API |
