# 整改方案（REMEDIATION PLAN）

> 依据：docs/ISSUES-REVIEW-2026-06-23.md + 独立复核确认的 3 个遗漏 P1
> 生成：2026-06-23
> 范围：5 项（P0×1 · P1×4），均为后端 + 前端代码改动，无需新增 DB migration（slug/isActive 列已存在）

---

## 待修清单总览

| # | 严重度 | 问题 | 涉及文件 |
|---|---|---|---|
| 1 | P0 | slug 从不提交 + CJK 名生成空 slug | api-client.ts / api/projects/route.ts / projects/new/page.tsx |
| 2 | P1 | 改名无条件覆盖 slug（所有 Mock URL 失效） | api/projects/[id]/route.ts |
| 3 | P1 | GET /api/projects/[id] 返回 isActive 为整数 | api/projects/[id]/route.ts |
| 4 | P1 | 三处 projectsApi.list().then(find) 全量拉取 | projects/[id]/page.tsx / endpoints/new/page.tsx / endpoints/[endpointId]/page.tsx |
| 5 | P1 | check-slug 不拦截保留字（可创建与路由冲突的 slug） | api/projects/check-slug/route.ts |

修复顺序：3 → 4 → 5 → 1 → 2（低风险先行，slug 链路最后统一改）

---

## 方案 3 [P1] isActive 整数 → 布尔

**文件**：src/app/api/projects/[id]/route.ts

**现状**：
- GET handler（约 42 行）`return success(projectList[0])`，直接返回原始行，isActive 为整数 1/0
- PUT handler（约 99 行）`return success(updated[0])`，同样返回整数
- 对比 api/projects/route.ts 的 format 函数做了 `isActive: Boolean(project.isActive)`

**改法**：新增一个局部 format（与列表接口一致），GET 和 PUT 返回都过一遍：

```ts
const formatProject = (p: typeof projects.$inferSelect) => ({
  ...p,
  isActive: Boolean(p.isActive),
});
```
- GET：`return success(formatProject(projectList[0]));`
- PUT：`return success(formatProject(updated[0]));`

**验收**：GET /api/projects/[id] 返回的 isActive 为 true/false；与 GET /api/projects 列表项类型一致。

---

## 方案 4 [P1] 全量拉取 → get(id)

**现状**：三处用 `projectsApi.list().then(find(p => p.id === id))` 做单项目获取，O(n) 全表扫描，且在项目数大时浪费。

**前提确认**：`projectsApi.get(id)` 已存在于 api-client.ts:232，无需新增。

**改法**（逐文件）：

1. `src/app/projects/[id]/page.tsx`（约 467-470 行）：
```ts
// 原
projectsApi.list().then(projects =>
  projects.find(p => p.id === projectId) || null
),
// 改
projectsApi.get(projectId),
```

2. `src/app/projects/[id]/endpoints/new/page.tsx`（约 88 行 loadProject）：
```ts
// 原
const projects = await projectsApi.list();
setProject(projects.find((p) => p.id === projectId) || null);
// 改
const project = await projectsApi.get(projectId);
setProject(project);
```
注意：loadProject 的 catch 现状是 `catch {}` 忽略，get 失败会抛 ApiError 被吞掉，setProject 不执行，停在 loadingProject。可接受（与现状行为一致：找不到项目即 loading 卡住），但更稳妥的是 catch 里 `setProject(null)`。保持最小改动，仅替换调用。

3. `src/app/projects/[id]/endpoints/[endpointId]/page.tsx`（约 243 行 loadData 的 Promise.all）：
```ts
// 原
projectsApi.list(),
// 改
projectsApi.get(projectId),
// 原
setProject(projects.find((p) => p.id === projectId) || null);
// 改（projects 变量已是单个 project）
setProject(projects);
```

**验收**：三处页面正常加载；GET /api/projects/[id] 不再触发全量列表请求（网络面板只见 /api/projects/{id} 单条）。

---

## 方案 5 [P1] check-slug 保留字拦截

**文件**：src/app/api/projects/check-slug/route.ts

**现状**：只查 DB 唯一性（`where(eq(projects.slug, ...))`），不拦截保留字。用户可创建 slug=api/projects/share/settings 的项目，与 `/{slug}/{path}` Mock 路由或应用路由前缀冲突。

**保留字清单**（推导自 app 路由结构 + demo seed）：
- 应用顶层路由段：`api`、`projects`、`share`、`settings`
- demo seed 专用：`demo-project`
- （`_next` 等 Next 内部路径因 slug 正则 `^[a-z0-9-]+$` 不含下划线，天然无法通过，无需列入）

**改法**：在 GET handler 内、DB 查询之前加保留字检查：

```ts
const RESERVED_SLUGS = ['api', 'projects', 'share', 'settings', 'demo-project'];

// 解析 slug 之后、DB 查询之前
if (RESERVED_SLUGS.includes(validated.slug)) {
  return success({
    slug: validated.slug,
    available: false,
    reason: 'reserved',
  });
}
```

注意：返回 available:false 而非报错，让前端按现有"已占用"逻辑提示（前端 slugStatus='exists' 会显示"此 Slug 已被使用"）。可选增强：返回 reason 后前端文案区分"保留字不可用"与"已被占用"。本批保持前端不改，复用现有 UI。

**验收**：check-slug?slug=api 返回 available:false；slug=my-api 仍正常查 DB。

---

## 方案 1 [P0] slug 提交链路（核心）

**根因**：前端 DTO 无 slug 字段、后端 schema 不接受 slug、POST 用 name 生成（CJK 产空）、前端不提交 slug。四者共同导致纯中文项目名创建出空 slug，Mock URL 断裂。

**改动（4 处）**：

### 1a. 前端 DTO 加 slug 字段

**文件**：src/lib/api-client.ts

```ts
export interface CreateProjectDto {
  name: string;
  slug?: string;          // 新增
  description?: string;
  basePath?: string;
}

export interface UpdateProjectDto {
  name?: string;
  slug?: string;          // 新增
  description?: string;
  basePath?: string;
  isActive?: boolean;
}
```

### 1b. 后端 CreateProjectSchema 接受 slug

**文件**：src/app/api/projects/route.ts

```ts
const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(100).optional(),  // 新增
  description: z.string().optional(),
  basePath: z.string().optional(),
});
```

### 1c. POST handler slug 生成逻辑

**文件**：src/app/api/projects/route.ts 的 POST

```ts
// 原
const slug = data.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// 改：优先用提交的 slug；否则用 name 生成；生成后仍空则报错
let slug = data.slug?.trim() || data.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

if (!slug) {
  return Errors.validation([{
    path: ['slug'],
    message: 'Slug 不能为空，中文项目名请手动填写英文 Slug',
  } as unknown as z.ZodIssue]);
}
```

加 slug 唯一性检查（撞 UNIQUE 返回友好错误，避免 500）：
```ts
const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
if (existing.length > 0) {
  return Errors.validation([{
    path: ['slug'],
    message: `Slug "${slug}" 已被使用`,
  } as unknown as z.ZodIssue]);
}
```
需 import `eq` from drizzle-orm。

### 1d. 前端提交 slug

**文件**：src/app/projects/new/page.tsx 的 handleSubmit（约 220 行）

```ts
// 原
const project = await projectsApi.create({
  name: form.name.trim(),
  description: form.description.trim() || undefined,
});
// 改
const project = await projectsApi.create({
  name: form.name.trim(),
  slug: form.slug.trim() || undefined,
  description: form.description.trim() || undefined,
});
```

**验收**：
1. 新建项目「my api」→ slug=my-api 正常创建，Mock URL 可访问
2. 新建项目「用户系统」（纯中文）→ slug 框为空 → 提示"Slug 不能为空"，用户手填 user-system 后创建成功
3. slug 撞库 → 提示"已被使用"而非 500
4. 前端不再有死代码 slug

---

## 方案 2 [P1] 改名不再覆盖 slug

**文件**：src/app/api/projects/[id]/route.ts 的 PUT

**现状**（约 69-71 行）：
```ts
if (data.name !== undefined) {
  updateData.name = data.name;
  // 更新 slug
  updateData.slug = data.name.toLowerCase().replace(...)...;  // ← 改名即覆盖 slug
}
```

**改法**：移除"改名即重新生成 slug"。slug 仅在显式提交 slug 字段时才更新：

```ts
if (data.name !== undefined) {
  updateData.name = data.name;
  // 不再因改名覆盖 slug
}
if (data.slug !== undefined) {
  updateData.slug = data.slug;
  // 加唯一性检查（撞库报错）
}
```

UpdateProjectSchema 加 slug 字段（与方案 1b 对称）：
```ts
const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(100).optional(),  // 新增
  description: z.string().optional(),
  basePath: z.string().optional(),
  isActive: z.boolean().optional(),
});
```

slug 显式更新时加唯一性检查（排除自身）：
```ts
if (data.slug !== undefined) {
  const conflict = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.slug, data.slug), ne(projects.id, id)));
  if (conflict.length > 0) {
    return Errors.validation([{ path: ['slug'], message: `Slug "${data.slug}" 已被使用` } as unknown as z.ZodIssue]);
  }
  updateData.slug = data.slug;
}
```
需 import `and`, `ne` from drizzle-orm。

**验收**：
1. 改项目名 → slug 不变，所有已集成 Mock URL 仍生效
2. 通过显式 slug 字段改 slug → 生效，且撞库报错
3. 两个项目同名 → 不再撞 slug（slug 独立）

---

## 不在本批范围

- 编辑页 QUICK_ERROR_SCENARIOS 双份数据去重（低优先级，保守版数值已对齐，功能正确）
- 根目录临时调试文件清理（仓库卫生，非功能问题）
- 存量空 slug 项目数据修复：本批让新建不再产生空 slug；存量空 slug 项目需用户自行补 slug（可通过一次性脚本，但需决策是否保留其现有 Mock URL 行为）

---

## 验证

全部改完后运行：
```bash
npx tsc --noEmit
npx vitest run
npx eslint "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"
```
目标：tsc 0 错误、vitest 全过、eslint 0 错误（保持现状基线）。
