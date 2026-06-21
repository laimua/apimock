# 页面功能缺陷审查报告

> 逐页面审查功能完整性、新建/编辑一致性、入口可达性。
> 聚焦「功能是否可用」「是否缺失」「是否一致」，不涉及代码风格。
> 最后更新：2026-06-21
> 重审：2026-06-21（逐项对照源码复核，修正 #8 误报，新增 #19）

---

## 严重度图例

| 级别 | 含义 |
|---|---|
| P0 | 核心功能不可用 / 用户走不通 |
| P1 | 重要功能缺失 / 严重不一致 |
| P2 | 体验缺陷 / 轻微不一致 |
| P3 | 增强建议 |

---

## 缺陷汇总

共 **19** 个功能缺陷：**P0×2** · **P1×5** · **P2×7** · **P3×5**

| # | 严重度 | 页面 | 缺陷 |
|---|---|---|---|
| 1 | P0 | 项目详情页 | 有端点后「添加端点」和「导入 OpenAPI」入口完全消失 |
| 2 | P0 | 新建端点页 vs 编辑页 | 新建缺失 AI 生成 / 模板库 / 错误场景，与编辑页严重不一致 |
| 3 | P1 | 端点表单(新建+编辑) | 无 tags 编辑入口，项目详情页 tag 筛选永远空 |
| 4 | P1 | 端点编辑页 | 快捷错误场景与 lib 常量重复且数值不一致 |
| 5 | P1 | 项目列表页→详情页 | 编辑按钮带 ?edit=true 但详情页不读取，点了无反应 |
| 6 | P1 | 分享页 | 详情/测试按钮用 DOM 模拟点击，实际点不动 |
| 7 | P1 | AI 设置页 | 5 个操作失败全静默，用户无感知 |
| 8 | **P3** | 分享页 | ~~noindex 用运行时 DOM 注入，SSR 不生效~~ **重审修正：layout.tsx 已有静态 metadata robots，SSR 已生效；page.tsx 客户端注入冗余，降级 P3** |
| 9 | P2 | 新建端点页 | 路径参数(:id)无格式校验 |
| 10 | P2 | 端点编辑页 | 无 tags 编辑(同 #3) |
| 11 | P2 | 项目详情页 | 请求记录 Tab 端点下拉只含当前页 |
| 12 | P2 | 新建项目页 | slug 前端校验拒绝中文但自动生成保留中文 |
| 13 | P2 | 首页 | demo 域名/响应体与真实 Mock 不符 |
| 14 | P2 | AI 设置页 | 未展示 AI 日预算用量 |
| 15 | P2 | 分享页 | 匿名访客全量可见所有 responseBody |
| 16 | P3 | 新建端点页 | 无 Mock URL 复制按钮(有预览但不可复制) |
| 17 | P3 | 新建项目页 | 描述计数器无长度强制 |
| 18 | P3 | 布局/首页 | title 双重设置中英不一致 |
| 19 | P3 | 项目详情页 | copyToClipboard catch 块假成功：失败时也 toast "已复制" |

---

## 重点：新建端点页 vs 编辑页 功能对比

这是本次审查发现的最大不一致。同一个端点的「创建」和「编辑」流程能力差距巨大：

| 功能 | 新建页 (new) | 编辑页 (edit) | 差距 |
|---|---|---|---|
| 基本信息表单(方法/路径/名称/描述/延迟) | 有 | 有 | 一致 |
| 路径模板快捷按钮 | 有 | 无 | new 更好 |
| URL 实时预览 | 有 | 有(侧边栏) | 一致 |
| 状态码网格选择 | 有 | 有 | 一致 |
| Content-Type 选择 | 有 | 有 | 一致 |
| JSON 编辑器 | 有 | 有 | 一致 |
| **AI 生成响应** | **无** | **有** | **缺失** |
| **模板库** | **无** | **有** | **缺失** |
| **快捷错误场景**(500/404/401等) | **无** | **有** | **缺失** |
| **完整错误场景选择器** | **无** | **有** | **缺失** |
| 响应规则编辑 | 无(合理,端点不存在) | 有 | 合理 |
| 请求记录 | 无(合理) | 有 | 合理 |
| Mock URL 复制 | 无(有预览) | 有 | 轻微 |
| 未保存守卫 | 无 | 有 | 可接受 |
| 创建并继续 | 有 | 不适用 | new 独有 |

**问题本质**：用户新建端点时只能手写响应体，想用 AI 生成或套模板必须先创建再进编辑页。这违背了「创建时就应该能高效配置」的预期。AI 生成、模板库、错误场景都是关于配置响应体的——而响应体在创建时就要填。

---

# 逐页面缺陷清单

## 项目详情页 `src/app/projects/[id]/page.tsx`

### [P0] #1 有端点后「添加端点」和「导入」入口完全消失

**现象**：项目详情页的「添加端点」按钮和「导入 OpenAPI」按钮只出现在两个地方：
- 端点列表空状态（`endpoints.length === 0` 时显示的卡片内）
- 空项目引导弹窗（OnboardingModal）

一旦项目有了至少一个端点，这两个按钮就彻底消失。页面头部按钮组只有：复制 / 编辑 / 分享 / 删除——没有任何「添加端点」入口。

**证据**（行号）：
- 添加端点 Link：仅第 853 行（空状态内）
- 导入 OpenAPI 按钮：仅第 844 行（空状态内）+ 第 1094 行（引导弹窗）
- 头部按钮组（第 645-695 行）：复制、编辑、分享、删除，无添加

**后果**：用户创建了第一个端点后，除非手敲 URL `/projects/{id}/endpoints/new`，否则无法再添加端点或导入。这是一个「走不通」的核心流程断裂。

**建议**：在端点列表标题栏（「端点列表」右侧）或头部按钮组增加常驻「添加端点」+「导入 OpenAPI」按钮。

### [P1] #5 编辑按钮 ?edit=true 未消费

项目列表页编辑铅笔跳转 `/projects/{id}?edit=true`，但本页无 useSearchParams 读取。点编辑 = 跳到详情页，编辑弹窗不弹出。

### [P2] #11 请求记录 Tab 端点下拉只含当前页

请求记录 Tab 的端点筛选下拉复用 `endpoints` state，而该 state 受端点列表 Tab 的分页/筛选影响（只含当前页）。切换到请求 Tab 时，下拉列出的端点不完整。

---

## 新建端点页 `src/app/projects/[id]/endpoints/new/page.tsx`

### [P0] #2 缺失 AI 生成 / 模板库 / 错误场景（见对比表）

**现象**：新建端点页的响应数据区域只有一个 JSON 编辑器，顶部没有 AI 生成和模板库按钮，表单里也没有快捷错误场景和完整错误场景选择器。

对比编辑页（同一份响应体配置区域），编辑页有：
- 响应数据 label 右侧：「模板库」按钮 + 「AI 生成」按钮
- 响应配置区：快捷错误场景网格（500/404/401/403/超时）
- 右侧栏：ErrorScenariosSelector 完整错误场景组件

**建议**：将 AI 生成、模板库、快捷错误场景提取为共享组件（或共享区块），在新建和编辑页都渲染。响应规则/请求记录是端点存在后才需要的，可不加。

### [P2] #9 路径参数无格式校验

validatePath 只查空。`/:`、`/users/:`、`/users/:123`(数字开头) 等写法能存入，到 Mock 路由按 startsWith(':') 匹配时可能出问题，但前端无提示。

### [P3] #16 无 Mock URL 复制按钮

有 URL 预览（蓝色提示框），但没有复制按钮。编辑页侧边栏有复制。建议预览框旁加复制。

---

## 端点编辑页 `src/app/projects/[id]/endpoints/[endpointId]/page.tsx`

### [P1] #4 快捷错误场景与 lib 常量重复且数值不一致

页面顶部硬编码了 QUICK_ERROR_SCENARIOS（5 种：500/404/401/403/超时5s），同时右侧栏又引入 ErrorScenariosSelector（来自 lib/error-scenarios.ts 的 12 种完整场景）。

两份常量内容冲突：
- 超时：页面快捷版 = 200 + 5s 延迟；lib 完整版 = 408 + 30s 延迟
- 页面快捷版无 502/503/504/400/网络错误/空响应/格式错误 JSON

**建议**：删除页面内 QUICK_ERROR_SCENARIOS，从 lib 的 ERROR_SCENARIOS 派生一个常用子集（如取前 5 个），避免双份维护。

### [P2] #10 无 tags 编辑入口

编辑页表单无 tag 编辑控件（同新建页）。

---

## 端点表单(新建 + 编辑) 共性问题

### [P1] #3 无 tags 编辑入口，tag 筛选永远空

**现象**：schema 有 tags 列（默认 '[]'），api-client 的 Endpoint 类型有 tags 字段，项目详情页有标签筛选框，但新建和编辑端点页的表单都没有 tag 输入控件。

**后果**：tag 永远是空数组，项目详情页的标签筛选框永远筛不出结果。这是一个「有筛选入口但无数据产生入口」的功能链断裂。

**建议**：在端点表单加 tag 编辑（逗号分隔的 input 即可，或 chip 组件），CreateEndpointDto / UpdateEndpointDto 已有 tags 字段，后端也已支持。

---

## 项目列表页 `src/app/projects/page.tsx`

本页是 9 页中功能最完整的。loading/error/empty/search-no-result/pagination/demo保护 全覆盖。无功能性缺陷。

（仅有一个跨页面问题：编辑按钮 ?edit=true 未被消费，见 #5。）

---

## 新建项目页 `src/app/projects/new/page.tsx`

### [P2] #12 slug 校验逻辑自相矛盾

generateSlug 正则 `[^a-z0-9\u4e00-\u9fa5]+` 保留中文，validateSlug 正则 `^[a-z0-9-]+$` 拒绝中文。输入中文项目名 → 自动生成的 slug 含中文 → 被判非法 → slug 框常驻红字错误。

### [P3] #17 描述计数器无长度强制

显示 `{length}/500` 但不校验，可超长提交。

---

## 首页 `src/app/page.tsx`

### [P2] #13 demo 域名/响应体与真实 Mock 不符

- 域名写死 `https://mock.apimock.io`（不存在的域名，用户够不到）
- 响应体显示纯数组，但真实 seed/AI 输出是 `{code, message, data:{list, total}}` 结构

**建议**：域名改为 localhost 或 Railway 实例；响应体改为真实结构。

---

## AI 设置页 `src/app/settings/ai/page.tsx`

### [P1] #7 所有操作失败全静默

五个 handler（load/add/update/delete/setDefault）的 catch 全是 `console.error`，无 toast、无错误态。

具体场景：
- 点「添加模型」失败（网络/重复名/key非法）→ 页面无反应
- loadProviders 失败 → 页面停在空列表，用户以为「没配置过」

**建议**：引入 useToast 反馈失败；loadProviders 失败设 error 态展示重试。

### [P2] #14 未展示 AI 日预算用量

后端有完整日预算机制（ai-budget.ts: getBudgetStatus），但设置页不展示。用户无法知道「还剩多少配额」「为什么降级到模板了」。

---

## 分享页 `src/app/share/[slug]/page.tsx`

### [P1] #6 详情/测试按钮点不动

端点行的「详情」「测试」按钮 onClick 用 `document.querySelectorAll('[data-detail-toggle]')` + `.click()` 来试图触发面板展开。但控制展开的是 EndpointDetailPanel/EndpointTestPanel 内部的独立按钮（各自持有 isExpanded 状态）。外层按钮 DOM 查询选中的是自己（data-detail-toggle 也挂在外层按钮上），模拟点击的不是控制面板的那个按钮。

**结果**：点「详情」「测试」面板不展开/不收起，核心交互完全失效。

**建议**：改为受控展开。父组件持有 expandedDetailId / expandedTestId state，传给面板组件做 props 控制，删除所有 DOM 查询 hack。

### [P3] #8 noindex 客户端注入冗余（重审降级）

**重审结论**：`src/app/share/[slug]/layout.tsx:3-8` 已有静态 metadata：
```ts
export const metadata = { robots: { index: false, follow: false } };
```
SSR 输出已包含 `<meta name="robots" content="noindex">`，爬虫首轮抓取不会索引。

`page.tsx:541-550` 的 useEffect 客户端注入冗余但**不失效**。原报告「SSR 不生效」判断错误（未读 layout.tsx）。

**建议**：删除 page.tsx 的 useEffect 注入逻辑，仅保留 layout.tsx 静态 metadata。

### [P2] #15 匿名访客全量可见 responseBody

分享接口返回所有端点的完整 responseBody，任何人拿到链接都能看全部 Mock 数据。无端点级可见性控制。

---

## 布局 `src/app/layout.tsx`

### [P3] #18 title 中英双重设置

布局 metadata title 英文，首页 useEffect 改中文。应统一为静态 metadata。

---

## 项目详情页 `src/app/projects/[id]/page.tsx`（补充）

### [P3] #19 copyToClipboard catch 块假成功

**位置**：`projects/[id]/page.tsx:412-419`

```ts
async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    success(`已复制: ${label}`);
  } catch {
    success(`已复制: ${label}`);  // ← catch 也调 success
  }
}
```

**问题**：剪贴板 API 失败（权限拒绝、非 HTTPS、浏览器不支持）时，仍提示「已复制」成功，用户被误导。

**建议**：catch 改 `toastError('复制失败，请手动复制')`。同页其他位置（分享页 `share/[slug]/page.tsx:588-595`）有相同模式，一并修复。

---

# 修复优先级建议

## 第一档：立即修复（P0/P1）

1. **项目详情页加常驻「添加端点」+「导入」按钮**（P0 #1）— 在端点列表标题栏右侧加按钮组
2. **新建端点页补 AI 生成 + 模板库 + 错误场景**（P0 #2）— 提取为共享组件在两页复用
3. **端点表单补 tags 编辑**（P1 #3）— 打通 tag 筛选链路
4. **分享页详情/测试按钮改受控展开**（P1 #6）— 删 DOM hack
5. **AI 设置页操作失败加 toast**（P1 #7）— 引入 useToast
6. **编辑按钮 ?edit=true 消费**（P1 #5）
7. **删除重复的 QUICK_ERROR_SCENARIOS**（P1 #4）— 从 lib 派生

## 第二档：排期修复（P2）

8. 路径参数格式校验（#9）
9. 请求记录端点下拉补全（#11）
10. slug 校验统一（#12）
11. 首页 demo 修正（#13）
12. AI 设置页展示预算（#14）
13. 分享页端点级可见性（#15）
14. 端点编辑页 tags 入口（#10，随 #3 一并）

## 第三档：增强（P3）

15. 新建端点页加 URL 复制（#16）
16. 描述长度强制（#17）
17. title 统一（#18）
18. 删除分享页冗余 noindex useEffect（#8，重审降级）
19. copyToClipboard catch 改 toastError（#19，含项目详情页 + 分享页）
