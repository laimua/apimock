# 功能缺陷修复实现规格

> 本文档是 FUNCTIONAL-DEFECTS.md 的实现交接层：把缺陷描述转成可直接照做的规格。
> 每条含：精确位置、现状代码、确切改法（含插入点）、组件 props、验收标准。
> 最后更新：2026-06-21

阅读约定：所有行号基于本次审查时的源码；插入/删除请以「上下文锚点」（唯一字符串）定位，不要只认行号。

---

# 纠正：原报告中两条会误导的修复建议

## 纠正 #2 — 不是「提取为共享组件」，而是「直接复用现有组件」

原报告写「将 AI 生成、模板库、快捷错误场景提取为共享组件」。这是错的。

核实结果：`AiGenerateDialog`、`TemplateLibraryDialog`、`ErrorScenariosSelector` **已经是独立组件**，props 干净，编辑页就是 import 后直接用的。新建端点页根本不需要「提取」，只需要：

1. import 这三个组件
2. 加 3 个 state（`showAiDialog` / `showTemplateDialog` / 响应区按钮）
3. 在响应数据 label 旁加 2 个按钮（照抄编辑页 JSX）

没有任何重构。照原建议做会产生不必要的改动。

## 纠正 #4 — 删除 QUICK_ERROR_SCENARIOS 有图标陷阱，不能简单换 lib 版

原报告写「删除页面内 QUICK_ERROR_SCENARIOS，从 lib 派生一个常用子集」。这会引入回归。

核实结果：页面内联版用 `scenario.icon`（字符串 `'server'/'search-off'/'lock'/'shield-off'/'clock'`）驱动一段约 150 行的图标 SVG 渲染 JSX。而 `src/lib/error-scenarios.ts` 的 `ErrorScenario` 类型**没有 icon 字段**，只有 `category`（'server'/'client'/'timeout'/'network'）。直接删掉换 lib 版，图标渲染会全部失效，且 category 与原 icon 映射不一一对应（如 lib 把 401/403 都归 client，原页面分别用 lock/shield-off 两个图标）。

正确改法见下文 #4 规格：保留页面快捷版，但数据来源改为「从 lib 的 ERROR_SCENARIOS 挑 5 个 + 为每个补一个 icon 字段」，单一数据源；或更保守——把超时数值硬编码对齐（5s 改 30s 或反之），不做结构迁移。两选一，不要混。

---

# P0/P1 逐条实现规格

## #1 [P0] 项目详情页加常驻「添加端点」+「导入」按钮

**文件**：`src/app/projects/[id]/page.tsx`

**插入点**：端点列表标题栏（第 732-739 行）。当前结构：

```
<div className="mb-4">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
    <h2 ...>端点列表</h2>
    <span ...>{total} 个端点 {筛选标记}</span>
  </div>
  ...
```

**改法**：把 `<span>` 那行替换为一个「计数 + 按钮组」容器。按钮 JSX 直接复用空状态里已有的（第 844-858 行），保证风格统一：

```jsx
<div className="flex items-center gap-3">
  <span className="text-gray-500 dark:text-gray-400 text-sm">
    {total} 个端点{search || methodFilter || tagFilter ? ' (已筛选)' : ''}
  </span>
  <button
    type="button"
    onClick={() => setIsImportOpen(true)}
    className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm"
  >
    <svg ...>...</svg>
    导入 OpenAPI
  </button>
  <Link
    href={`/projects/${projectId}/endpoints/new`}
    className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
  >
    添加端点
  </Link>
</div>
```

**依赖确认**：`isImportOpen` state 已存在（第 380 行），`<ImportOpenAPI>` 组件已挂载（第 1051 行），新增按钮只是多一个触发点，无需新建 state。

**验收**：
1. 项目有 ≥1 个端点时，标题栏右侧可见「导入 OpenAPI」+「添加端点」两个按钮
2. 点「添加端点」跳转 `/projects/{id}/endpoints/new`
3. 点「导入 OpenAPI」弹出已存在的 ImportOpenAPI 对话框
4. 空状态的两个按钮保留不动（冗余但无害，或可一并移除）

---

## #2 [P0] 新建端点页补 AI 生成 + 模板库 + 错误场景

**文件**：`src/app/projects/[id]/endpoints/new/page.tsx`

**组件 props（已存在，直接用）**：

| 组件 | 文件 | props |
|---|---|---|
| `AiGenerateDialog` | `@/components/AiGenerateDialog` | `{ isOpen, onClose, onGenerated: (data) => void }` |
| `TemplateLibraryDialog` | `@/components/TemplateLibraryDialog` | `{ isOpen, onClose, onApply: (content: string) => void }` |
| `ErrorScenariosSelector` | `@/components/ErrorScenariosSelector` | `{ onApply: (scenario) => void, disabled?: boolean }` |

注意：编辑页还用了页面内联的 `QUICK_ERROR_SCENARIOS`（快捷版网格）。新建页本次**只补 AI 生成 + 模板库 + 完整 ErrorScenariosSelector**，不复制快捷网格——快捷网格的归属问题在 #4 单独处理，避免双份问题扩散到新建页。

**改动**：

1. 顶部 import 三个组件 + `applyErrorScenario` 类型：
```ts
import { AiGenerateDialog } from '@/components/AiGenerateDialog';
import { TemplateLibraryDialog } from '@/components/TemplateLibraryDialog';
import { ErrorScenariosSelector } from '@/components/ErrorScenariosSelector';
import { applyErrorScenario, type ErrorScenario } from '@/lib/error-scenarios';
```

2. 加 state（放在现有 state 附近）：
```ts
const [showAiDialog, setShowAiDialog] = useState(false);
const [showTemplateDialog, setShowTemplateDialog] = useState(false);
```

3. 改响应数据 label 区（第 543-547 行）。当前：
```jsx
<label className="block text-sm font-medium ...">响应数据</label>
<div className="relative">
```
改为 label + 按钮行（照抄编辑页第 854-870 行的结构）：
```jsx
<div className="flex items-center justify-between mb-2">
  <label className="block text-sm font-medium ...">响应数据</label>
  <div className="flex items-center gap-2">
    <button type="button" onClick={() => setShowTemplateDialog(true)} ...>模板库</button>
    <button type="button" onClick={() => setShowAiDialog(true)} ...>AI 生成</button>
  </div>
</div>
<div className="relative">
```
（按钮 className 照搬编辑页：模板库用 indigo 系，AI 生成用 purple 系）

4. 加 handler（放 handleSubmit 附近）：
```ts
const handleAiGenerated = (data: unknown) => {
  setForm((prev) => ({ ...prev, responseBody: JSON.stringify(data, null, 2) }));
};
const handleTemplateApplied = (content: string) => {
  setForm((prev) => ({ ...prev, responseBody: content }));
  success('模板已应用');
};
const handleApplyErrorScenario = (scenario: ErrorScenario) => {
  const applied = applyErrorScenario(scenario);
  setForm((prev) => ({
    ...prev,
    statusCode: applied.statusCode,
    contentType: applied.contentType,
    delayMs: applied.delayMs,
    responseBody: applied.responseBody,
  }));
  success(`已应用错误场景: ${scenario.name}`);
};
```

5. 在表单 Card 之后（约第 600 行，操作按钮之前）加 ErrorScenariosSelector，或在响应配置 Card 内部加一个区块。参考编辑页放右侧栏；新建页是单列布局，建议放在「响应配置」Card 内、响应数据区块下方：
```jsx
<ErrorScenariosSelector onApply={handleApplyErrorScenario} disabled={loading} />
```

6. 在组件末尾（`</main>` 之前）挂载两个 Dialog：
```jsx
<AiGenerateDialog isOpen={showAiDialog} onClose={() => setShowAiDialog(false)} onGenerated={handleAiGenerated} />
<TemplateLibraryDialog isOpen={showTemplateDialog} onClose={() => setShowTemplateDialog(false)} onApply={handleTemplateApplied} />
```

**注意**：`useToast` 已在新建页引入（`const { success, error: toastError } = useToast()`），handler 里的 `success` 直接可用。

**验收**：
1. 新建端点页响应数据 label 右侧出现「模板库」「AI 生成」按钮
2. 点「AI 生成」弹出对话框，生成后内容填入响应体编辑器
3. 点「模板库」弹出对话框，选模板后内容填入
4. 页面可见 ErrorScenariosSelector，点某个场景后状态码/contentType/delay/body 同步更新
5. 创建端点后进编辑页，配置一致

---

## #3 [P1] 端点表单补 tags 编辑

**文件**：`src/app/projects/[id]/endpoints/new/page.tsx` + `src/app/projects/[id]/endpoints/[endpointId]/page.tsx`

**后端状态**：已就绪，**无需改后端**。核实：
- `CreateEndpointSchema`（endpoints/route.ts）：`tags: z.array(z.string()).optional()`
- `UpdateEndpointSchema`（[endpointId]/route.ts）：`tags: z.array(z.string()).optional()`
- POST/PATCH 都做 `JSON.stringify(data.tags)`
- api-client 的 `CreateEndpointDto`/`UpdateEndpointDto` 已有 `tags?: string[]`
- 纯前端缺陷

**改动（两页都做，结构相同）**：

1. form state 加 tags 字段：
```ts
// 新建页：form 初始值加 tags: [] as string[]
// 编辑页：InitialFormState 加 tags: string[]，loadData 时从 endpoint.tags 填充
```

2. 在「描述」字段下方加 tag 输入（逗号分隔的简单 input）：
```jsx
<div>
  <label className="block text-sm font-medium ...">标签</label>
  <input
    type="text"
    value={form.tags.join(', ')}
    onChange={(e) => {
      const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
      setForm((prev) => ({ ...prev, tags }));
    }}
    placeholder="用逗号分隔，如: 用户, 列表, 分页"
    className="..."
  />
  <p className="mt-1 text-xs text-gray-500">用于项目详情页的标签筛选</p>
</div>
```

3. 提交时带上 tags（新建页 handleSubmit 已有 endpointsApi.create 调用，DTO 加 `tags: form.tags`）。

**验收**：
1. 新建端点时填「用户, 列表」，创建后进编辑页 tags 仍在
2. 项目详情页标签筛选框输入「用户」能筛出该端点
3. 编辑页改 tags 后保存，详情页筛选立即生效

---

## #4 [P1] 删除/对齐重复的 QUICK_ERROR_SCENARIOS

**文件**：`src/app/projects/[id]/endpoints/[endpointId]/page.tsx`

**陷阱提醒**：见文首「纠正 #4」。页面内联版用 `scenario.icon` 字符串驱动 150 行图标 JSX，lib 版没有 icon 字段。**不要**简单替换数据源。

**推荐改法（保守版，低风险）**：保留页面快捷版结构不变，只对齐数值差异。把页面 QUICK_ERROR_SCENARIOS 里超时项的 `delayMs: 5000` 改为与 lib 一致的 `30000`，`statusCode: 200` 改为 `408`，`responseBody` 用 lib 同款。这样两份数据语义一致，不破坏图标渲染。

**改法（彻底版，稍高风险）**：在 `src/lib/error-scenarios.ts` 给 `ErrorScenario` 加可选 `icon?: string` 字段，为 12 个场景补 icon 映射（server→'server'，client 内 400/401/403/404 各给一个），然后页面删除 QUICK_ERROR_SCENARIOS，从 `ERROR_SCENARIOS` 取 `['server-500','client-401','client-403','client-404','timeout']` 派生快捷版。需要同时改类型 + 12 条数据 + 页面渲染。

**验收**：
- 保守版：编辑页快捷网格点「超时」，状态码显示 408 而非 200，延迟 30000 而非 5000，与右侧完整选择器的超时项一致
- 彻底版：删除 QUICK_ERROR_SCENARIOS 后，快捷网格图标仍全部正常渲染；改 lib 里某个场景的数值，页面同步变化

---

## #5 [P1] 编辑按钮 ?edit=true 消费

**文件**：`src/app/projects/[id]/page.tsx`

**现状**：`EditProjectDialog` 由 `isEditDialogOpen` state 控制，初始 false，只在点页面内「编辑」按钮时 set true。从不读 URL。

**改法**：

1. import（顶部）：
```ts
import { useSearchParams } from 'next/navigation';
```

2. 组件内加（`useRouter` 附近）：
```ts
const searchParams = useSearchParams();
```
注意：用 useSearchParams 会让该组件需要 Suspense 边界。Next.js 16 下，如果该 page 是 'use client'，需确认外层 layout 有 Suspense，否则构建时可能警告。可包一层：把当前默认导出组件体抽成内层组件，外层用 `<Suspense>` 包裹。

3. 加 useEffect（在现有「空项目引导」useEffect 附近）：
```ts
useEffect(() => {
  if (searchParams.get('edit') === 'true') {
    setIsEditDialogOpen(true);
    // 可选：清理 URL，避免刷新重复弹窗
    // router.replace(`/projects/${projectId}`);
  }
}, [searchParams]);
```

**验收**：
1. 从项目列表点编辑铅笔 → 跳详情页 → 编辑弹窗自动弹出
2. 手动访问 `/projects/{id}` 不带参数 → 不弹窗
3. 弹窗关闭后刷新页面不重复弹（除非 URL 仍有 edit=true）

---

## #6 [P1] 分享页详情/测试按钮改受控展开

**文件**：`src/app/share/[slug]/page.tsx`

**现状**：`EndpointDetailPanel`/`EndpointTestPanel` 各自内部 `const [isExpanded, setIsExpanded] = useState(false)`。外层按钮用 `document.querySelectorAll('[data-detail-toggle]').forEach(btn => ... .click())` 想触发，但选中的是自己。

**改法**：

1. 删除两个子组件内部的 `isExpanded` state，改为 props 受控：
```tsx
// 子组件签名改为
function EndpointDetailPanel({ endpoint, isExpanded, onToggle }: {
  endpoint: ShareEndpoint; isExpanded: boolean; onToggle: () => void;
}) {
  // 用 isExpanded 控制显示，按钮 onClick={onToggle}
}
```

2. 父组件 `SharePage` 加状态（按端点 id 记录展开项，支持每个端点独立）：
```ts
const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);
const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
```

3. 端点行的外层「详情」「测试」按钮 onClick 直接切 state：
```tsx
onClick={() => setExpandedDetailId(prev => prev === endpoint.id ? null : endpoint.id)}
onClick={() => setExpandedTestId(prev => prev === endpoint.id ? null : endpoint.id)}
```

4. 渲染子组件传 props：
```tsx
<EndpointDetailPanel
  endpoint={endpoint}
  isExpanded={expandedDetailId === endpoint.id}
  onToggle={() => setExpandedDetailId(prev => prev === endpoint.id ? null : endpoint.id)}
/>
```

5. 删除所有 `document.querySelectorAll` / `data-detail-toggle` / `data-test-toggle` / `.click()` 代码。

**验收**：
1. 点「详情」→ 该端点详情面板展开；再点 → 收起
2. 不同端点互不影响（A 展开不影响 B）
3. 「测试」按钮同理
4. 无任何 `document.querySelector` 残留

---

## #7 [P1] AI 设置页操作失败加 toast

**文件**：`src/app/settings/ai/page.tsx`

**现状**：5 个 handler 的 catch 全是 `console.error`，无用户反馈。

**改法**：

1. 引入 toast（页面已 import 了组件，但没引入 useToast）：
```ts
import { useToast } from '@/components/ui/Toast';
// 组件内
const { success: toastSuccess, error: toastError } = useToast();
```

2. 每个 catch 改为：
```ts
} catch (err) {
  toastError(err instanceof Error ? err.message : '操作失败');
  console.error('xxx failed:', err);  // 保留日志
}
```

3. loadProviders 失败要特别处理——加 error state 显示重试 UI，否则页面停在空列表：
```ts
const [loadError, setLoadError] = useState<string | null>(null);
// catch 里
setLoadError('加载失败，请重试');
// 渲染：loadError 时显示错误卡片 + 重试按钮 onClick={loadProviders}
```

**验收**：
1. 断网状态下点「添加模型」→ 弹出错误 toast，页面有反馈
2. loadProviders 失败 → 显示「加载失败」+ 重试按钮，而非空列表
3. 操作成功仍正常，无多余 toast

---

## #8 [P3] 删除分享页冗余 noindex useEffect

**文件**：`src/app/share/[slug]/page.tsx`

**现状**：`layout.tsx` 已有静态 `metadata.robots`（SSR 生效），page.tsx 的 useEffect 客户端再插一次，冗余。

**改法**：删除 page.tsx 中插入 robots meta 的 useEffect（约第 541-550 行）。

**验收**：删除后访问分享页，view-source 仍能看到 `<meta name="robots" content="noindex">`（来自 layout）。

---

# 修复顺序建议

按依赖与风险排（先做能立即验证、低耦合的）：

1. #8（删冗余 useEffect，1 分钟，零风险）
2. #5（?edit=true 消费，注意 Suspense）
3. #7（AI 设置 toast）
4. #6（分享页受控展开，删除 DOM hack）
5. #3（tags 编辑，纯前端）
6. #1（项目详情常驻按钮）
7. #2（新建端点页补 AI/模板/错误场景）
8. #4（错误场景对齐，最后做，有图标陷阱）

每条做完跑一遍对应 E2E（e2e/ 目录有 project / ai-providers / template-library / slug-validation 等 spec）。

---

# 第二批规格（P2 + 收尾）

## #19 [P3] copyToClipboard catch 块假成功（收尾）

**文件**：`src/app/projects/[id]/page.tsx` + `src/app/share/[slug]/page.tsx`

**现状**（两处相同模式）：
```ts
async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    success(`已复制: ${label}`);
  } catch {
    success(`已复制: ${label}`);   // ← 失败也报成功
  }
}
```

**改法**：两处 catch 块的 `success` 改为 `toastError`。
- 项目详情页：`catch { toastError('复制失败，请手动复制'); }`（该页已解构 `toastError`）
- 分享页：分享页的 copyToClipboard 用的是本地 `showToast`（非 useToast），改为传错误样式或新增一个 toast error 态；最简做法：catch 里 `showToast` 改成红色提示——但分享页 toast 只有绿色一种样式。最小改动：catch 里用 `alert('复制失败，请手动复制')` 或给 toast 加 type 字段。建议项目详情页直接改 toastError，分享页加一个简单 error toast（加 type 区分）。

**验收**：在非 HTTPS 或拒绝剪贴板权限环境下点复制，提示失败而非成功。

---

## #9 [P2] 路径参数格式校验

**文件**：`src/app/projects/[id]/endpoints/new/page.tsx` + `[endpointId]/page.tsx`

**现状**：两页的 validatePath 只查空，不校验 `:param` 写法。`/:`、`/users/:`、`/users/:123` 能存入，到 Mock 路由按 `startsWith(':')` 匹配时行为异常。

**改法**：validatePath 加路径段校验。合法路径段：纯文本段、或以 `:` 开头且后跟字母/下划线（`:id`、`:userId`）。建议正则：
```ts
function validatePath(path: string): string | undefined {
  const p = path.trim() || '/';
  if (!p) return '路径不能为空';
  if (!p.startsWith('/')) return '路径必须以 / 开头';
  const segments = p.split('/').slice(1); // 去掉首空段
  for (const seg of segments) {
    if (seg === '') continue; // 允许尾斜杠
    if (seg.startsWith(':')) {
      if (!/^:[a-zA-Z_][a-zA-Z0-9_]*$/.test(seg)) {
        return `路径参数 "${seg}" 格式非法，应为 :字母开头（如 :id）`;
      }
    }
  }
  return undefined;
}
```
两页共用一份逻辑（可抽到 `src/lib/path-validate.ts`，或各自内联）。

**验收**：输入 `/users/:` 或 `/users/:123` 提交时显示错误；`/users/:id` / `/users/:userId/posts` 通过。

---

## #11 [P2] 请求记录 Tab 端点下拉补全

**文件**：`src/app/projects/[id]/page.tsx`

**现状**：请求记录 Tab 的端点筛选下拉用 `endpoints` state，而该 state 受端点列表 Tab 的分页/筛选影响（只含当前页）。切到请求 Tab 时下拉不完整。

**改法**：请求记录 Tab 加载时单独拉一份不分页的全量端点列表作为下拉数据源。
```ts
const [requestFilterEndpoints, setRequestFilterEndpoints] = useState<Endpoint[]>([]);
// loadRequests 里追加
const allEps = await endpointsApi.list(projectId); // 不传分页参数 = 全量
setRequestFilterEndpoints(allEps as Endpoint[]);
```
请求记录 Tab 的下拉改用 `requestFilterEndpoints` 而非 `endpoints`。

**验收**：端点列表 Tab 翻到第 2 页后切到请求记录 Tab，端点下拉显示全部端点（含第 1 页）。

---

## #12 [P2] 前端 slug 正则统一（仅前端，不含底层提交链路）

**文件**：`src/app/projects/new/page.tsx`

**边界说明**：本条只统一前端 generateSlug 与 validateSlug 的矛盾。真正导致纯中文名空 slug 的底层问题（slug 从不提交 + 后端剥中文，见 FEATURE-AUDIT-REPORT.md 的 P0）不在本批范围，需单独决策。

**现状**：
- generateSlug（第 44 行）：`/[^a-z0-9\u4e00-\u9fa5]+/g` → 保留中文
- validateSlug（第 67 行）：`/^[a-z0-9-]+$/` → 拒绝中文

**改法**：generateSlug 改为与 validateSlug 一致，不保留中文：
```ts
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```
即去掉 `\u4e00-\u9fa5`。这样中文项目名生成的 slug 为空，validateSlug 会报「不能为空」，提示用户手动填英文 slug——与现状行为一致但不再自相矛盾（不再生成一个自己又判非法的值）。

**验收**：输入纯中文名「用户系统」，slug 框变空并提示「Slug 不能为空」；输入「my api」生成 `my-api` 且通过校验。不再出现「slug 含中文但框里红字」的矛盾态。

---

## #13 [P2] 首页 demo 修正

**文件**：`src/app/page.tsx`

**现状**（第 85-92 行）：
- 域名写死 `https://mock.apimock.io/demo-project/users`（不存在的域名）
- 响应体显示纯数组 `[{...}]`，但真实 seed/AI 输出是 `{code, message, data:{list, total}}`

**改法**：
1. 域名改为 `http://localhost:3000/demo-project/users`（README 用的就是这个）
2. 响应体改为真实结构示例：
```
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      { "id": 1, "name": "张伟", "email": "user1@example.com" }
    ],
    "total": 1
  }
}
```

**验收**：首页 demo 块显示 localhost 域名；响应体是 `{code,message,data:{list,total}}` 结构。

---

## #14 [P2] AI 设置页展示日预算用量

**文件**：新建 `src/app/api/ai/budget/route.ts` + 改 `src/app/settings/ai/page.tsx`

**现状**：`ai-budget.ts` 有 `getBudgetStatus()`（返回 {date, requests, tokens, limits}），但**无 API 暴露**。AI 设置页不展示用量。

**改法**：

1. 新建 `src/app/api/ai/budget/route.ts`：
```ts
import { NextResponse } from 'next/server';
import { success } from '@/lib/api';
import { getBudgetStatus } from '@/lib/ai-budget';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getBudgetStatus();
  return success(status);
}
```
注意：该端点是否需要鉴权？AI 设置页本身无鉴权（项目是自托管无登录），此端点暴露当日 token/请求计数。可接受（自托管场景），但若担心可加 ADMIN_TOKEN。本批保持无鉴权以匹配现有 ai/providers 的开放性。

2. AI 设置页顶部加用量卡片：
```ts
const [budget, setBudget] = useState<{requests:number;tokens:number;limits:{tokens:number;requests:number}} | null>(null);
// loadProviders 里或单独 effect 拉取
useEffect(() => {
  fetch('/api/ai/budget').then(r => r.json()).then(j => j.success && setBudget(j.data)).catch(()=>{});
}, []);
```
渲染（默认 Provider 卡片附近）：
```jsx
{budget && (
  <Card className="mb-6"><CardBody>
    <div className="text-sm text-gray-600 mb-2">今日 AI 用量</div>
    <div className="flex gap-6 text-sm">
      <span>请求 {budget.requests}/{budget.limits.requests}</span>
      <span>Token {budget.tokens}/{budget.limits.tokens}</span>
    </div>
  </CardBody></Card>
)}
```

**验收**：AI 设置页顶部显示「今日 AI 用量」卡片，数值随实际调用增长；超出限额前能直观看到剩余。

---

# 本批不做（需决策）

- **#15 分享页端点级可见性**：需改 schema（endpoints 加 isShareable 列）+ 产品决策（默认全可见还是默认隐藏），不适合自动执行。待确认。
- **#4 彻底版**（QUICK_ERROR_SCENARIOS 从 lib 派生）：保守版数值对齐已做，彻底版有图标陷阱，可选。
- **#16/#17/#18**（P3 增强）：URL 复制、描述长度强制、title 统一，可最后批量处理。

---

# 第三批规格（P3 收尾）

## #16 [P3] 新建端点页加 Mock URL 复制按钮

**文件**：`src/app/projects/[id]/endpoints/new/page.tsx`

**现状**：第 432-436 行有 URL 预览框，但没有复制按钮。编辑页侧边栏有复制（用 copyToClipboard）。新建页未引入 copyToClipboard 工具函数。

**现状代码**（约 432 行）：
```jsx
<div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
  <p className="text-xs text-blue-700 dark:text-blue-300 mb-1 font-medium">Mock URL 预览：</p>
  <code className="text-sm text-blue-800 dark:text-blue-200 font-mono break-all">
    {getMockUrl()}
  </code>
</div>
```

**改法**：

1. 顶部 import（新建页已 import useToast，但需引入复制工具）：
```ts
import { copyToClipboard } from '@/lib/utils';
```
注意：`src/lib/utils.ts` 导出的 `copyToClipboard` 返回 Promise<boolean>（成功与否），不自带 toast。本页已有 useToast 的 success/toastError。

2. 在预览框内 `<code>` 下方加复制按钮：
```jsx
<div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
  <div className="flex items-center justify-between mb-1">
    <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">Mock URL 预览：</p>
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(getMockUrl());
        if (ok) success('已复制 Mock URL');
        else toastError('复制失败，请手动复制');
      }}
      disabled={loading || !form.path}
      className="text-xs text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50"
    >
      复制
    </button>
  </div>
  <code className="text-sm text-blue-800 dark:text-blue-200 font-mono break-all block">
    {getMockUrl()}
  </code>
</div>
```

**陷阱提醒**：先确认 `src/lib/utils.ts` 的 `copyToClipboard` 签名是否返回 Promise<boolean>；若它内部直接 throw 或无返回值，需改用内联的 `navigator.clipboard.writeText`。以实际 utils 为准，不要假设。

**验收**：填路径后预览框出现「复制」按钮；点击后成功提示，失败提示错误。

---

## #17 [P3] 描述长度强制校验

**文件**：`src/app/projects/new/page.tsx`

**现状**：表单显示 `{form.description.length}/500` 计数，但 validate 函数不校验 description，可超长提交。

**改法**：

1. validateDescription 函数（加在 validateSlug 附近）：
```ts
function validateDescription(description: string): string | undefined {
  if (description.length > 500) {
    return '描述不能超过 500 字符';
  }
  return undefined;
}
```

2. handleBlur 的 description 分支加校验（FormErrors 接口加 description?: string）。

3. handleSubmit 里校验：`description: validateDescription(form.description)`。

**验收**：输入超过 500 字符的描述，提交时显示错误，无法提交；计数器超过 500 变红（可选）。

---

## #18 [P3] 首页/布局 title 统一

**文件**：`src/app/page.tsx` + `src/app/layout.tsx`

**现状**：
- `layout.tsx:11`：metadata title = `"ApiMock - API Mock Server"`（英文，静态）
- `page.tsx:9-10`：useEffect 里 `document.title = 'ApiMock - AI 智能 Mock 平台'`（中文，运行时覆盖）

**陷阱提醒**：首页是 `'use client'`（因为用了 useEffect + React import）。如果直接在首页加 `export const metadata` 会报错（client component 不能导出 metadata）。两条路：

- **方案 A（推荐，最小改动）**：保留 layout 的英文 title，删除首页的 useEffect。统一用 layout 的英文 title。首页去掉 useEffect 后，若首页无其他 client 逻辑（检查是否有 useState/useEvent），可移除 `'use client'`。核实：首页只用了 Link 和静态 JSX，删 useEffect 后可去 `'use client'`，但要同时删 `import { useEffect }` 和 React 默认 import 中未用部分。

- **方案 B**：首页保持 client，但把 title 改成与 layout 一致的文案（或统一中文，同步改 layout）。这个改动无需移除 client 标记。

**建议**：走方案 A。删除首页第 9-11 行的 useEffect，确认移除后首页无其他 client 用法（useState/event handler），若干净则同时移除首行 `'use client'` 和 useEffect import，让 layout 的英文 title 生效。若发现首页还有其他 client 依赖无法移除，退回方案 B（只统一文案）。

**验收**：访问首页，浏览器标签 title = `ApiMock - API Mock Server`（layout 的），不再被运行时改写；源码无 document.title 调用。

---

# 第四批决策（需用户拍板，不自动执行）

- **#15 分享页端点级可见性**：需 schema 改动（endpoints 加 isShareable 列）+ 产品决策（默认全可见还是默认隐藏？迁移存量数据如何处理？）。等你确认方向后再写规格。

---

# 第四批规格（#15 分享页端点级可见性）

## 决策（按优选项）

1. **粒度**：端点级 `isShareable` 列（integer，1=可见/0=隐藏），而非项目级。端点级更灵活，Mock 场景下不同端点敏感度不同（如含真实字段名的 schema 端点可能想隐藏，纯 demo 端点可露）。
2. **默认值**：默认全可见（DEFAULT 1）。向后兼容——存量分享链接不会突然少端点（破坏性变更的对立面）。新端点也默认可见，符合「Mock 工具就是给团队看」的定位。
3. **schema 改动**：接受，走 drizzle migration。加列 DEFAULT 1，存量数据靠 DB DEFAULT 自动可见，无需数据迁移脚本。

## 涉及文件

- `src/lib/schema-sqlite.ts` + `src/lib/schema-mysql.ts`：endpoints 表加 isShareable 列
- 新增 drizzle migration（`pnpm db:generate` 自动生成）
- `src/app/api/projects/[id]/endpoints/route.ts`：CreateEndpointSchema 加字段
- `src/app/api/projects/[id]/endpoints/[endpointId]/route.ts`：UpdateEndpointSchema 加字段
- `src/app/api/share/[slug]/route.ts`：查询过滤 isShareable = 1
- `src/lib/api-client.ts`：Endpoint 类型 + Create/Update DTO 加字段
- `src/app/projects/[id]/endpoints/new/page.tsx` + `[endpointId]/page.tsx`：表单加开关
- 分享页 `share/[slug]/page.tsx`：无需改（后端过滤后返回的端点已少）

## 逐处改法

### 1. schema 加列（两个 schema 文件，仿照 isActive 写法）

在 `schema-sqlite.ts` 和 `schema-mysql.ts` 的 endpoints 表定义里，`isActive` 那行下方加：
```ts
isShareable: integer('is_shareable').notNull().default(1),
```
（MySQL 版用对应的 integer 写法，与同文件 isActive 一致即可。）

注意：两个 schema 文件都要改，保持同步。改完跑 `pnpm db:generate` 生成 migration（会产出 `0003_xxx.sql`，含 `ALTER TABLE endpoints ADD COLUMN is_shareable integer NOT NULL DEFAULT 1`）。**不要跑 db:push 或 db:migrate**（需连库）。

### 2. 后端 API schema 加字段

`endpoints/route.ts` 的 CreateEndpointSchema 加：
```ts
isShareable: z.boolean().optional(),
```
POST handler 里 newEndpoint 对象加 `isShareable: data.isShareable === false ? 0 : 1`（默认 1，显式 false 才 0）。返回时 `isShareable: Boolean(...)`。

`endpoints/[endpointId]/route.ts` 的 UpdateEndpointSchema 同样加 `isShareable: z.boolean().optional()`，PUT handler 里 `if (data.isShareable !== undefined) updateData.isShareable = data.isShareable ? 1 : 0`。

### 3. share route 过滤

`share/[slug]/route.ts` 第 51-52 行的端点查询，where 条件从单一 `eq(endpoints.projectId, project.id)` 改为 `and(eq(endpoints.projectId, project.id), eq(endpoints.isShareable, 1))`。需要 import `and`。

陷阱提醒：返回的 endpoints select 字段里**不要**包含 isShareable（分享是公开接口，无需暴露这个内部字段）。当前 select 是显式列枚举，确认没有 isShareable 即可。

### 4. api-client 类型

`api-client.ts` 的 Endpoint 接口加 `isShareable: boolean`，CreateEndpointDto / UpdateEndpointDto 加 `isShareable?: boolean`。

### 5. 端点表单加开关（新建页 + 编辑页）

在「标签」字段下方（或「模拟延迟」附近）加一个复选框/开关：
```jsx
<div>
  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
    <input
      type="checkbox"
      checked={form.isShareable}
      onChange={(e) => setForm((prev) => ({ ...prev, isShareable: e.target.checked }))}
      disabled={loading}
    />
    在分享页显示此端点
  </label>
  <p className="mt-1 text-xs text-gray-500">关闭后，访问分享页的协作者看不到此端点</p>
</div>
```

- 新建页 form 初始值加 `isShareable: true`
- 编辑页 InitialFormState 加 `isShareable: boolean`，loadData 从 `endpointData.isShareable` 填充，deepEqual 比对加该字段，提交 DTO 带 `isShareable: form.isShareable`

## 验收

1. 新建端点默认勾选「在分享页显示」，分享页能看到该端点
2. 编辑端点取消勾选并保存，分享页该端点消失，但 Mock URL 仍可访问（isShareable 只影响分享页列表，不影响 Mock 路由）
3. 存量端点（无此列的旧数据）经 migration 后默认可见，分享页行为不变
4. Mock 服务本身（`/{slug}/{path}`）不受 isShareable 影响——这是分享页可见性，不是 Mock 访问控制
5. `pnpm db:generate` 产出的 migration 文件含正确的 ALTER TABLE 语句
