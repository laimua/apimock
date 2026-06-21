# 页面功能评审报告

> 基于 FEATURES.md 功能基线，对全部 9 个前端页面逐一评审。
> 评审维度：完整性 / 合理性 / 一致性 / 缺失功能。
> 最后更新：2026-06-21

## 严重度图例

| 级别 | 含义 | 处置建议 |
|---|---|---|
| **P0 阻断** | 功能不可用 / 数据损坏 / 安全漏洞 | 必须修复 |
| **P1 重要** | 核心流程缺陷或交互失效 | 应尽快修复 |
| **P2 一般** | 体验或一致性问题 | 排期修复 |
| **P3 优化** | 增强或可改进项 | 按需处理 |

## 汇总

共发现 **23** 个问题：**P0x1** · **P1x5** · **P2x9** · **P3x8**。

按页面分布（含跨页面问题）：

| 页面 | 问题数 | 最严重 |
|---|---|---|
| 新建项目页 | 3 | P0 |
| 项目详情页 | 4 | P2 |
| 端点详情页 | 4 | P2 |
| 分享页 | 4 | P1 |
| AI 设置页 | 2 | P2 |
| 首页 | 3 | P2 |
| 项目列表页 | 2 | P2 |
| 布局 | 1 | P2 |

全局/跨页面问题（出现在多处）：

- **全量拉取项目列表再 find 单条**（项目详情、端点新建、端点详情 3 处）— 有 `projectsApi.get(id)` 却未用
- **数据类型不一致**（`isActive` 布尔 vs 整数、`createdAt` 类型声明为 string 实为 number）

---

# 跨页面问题（架构层）

## [P0] 新建项目时 slug 实际从未提交，纯中文项目名生成空 slug

**位置**：`src/app/projects/new/page.tsx` submit 处、`src/app/api/projects/route.ts:72` 后端 slug 生成

**问题**：新建项目页有完整的 slug 输入框、实时唯一性校验、可用/已用状态图标，但 handleSubmit 调用的是：

    projectsApi.create({ name: form.name.trim(), description: ... })

`CreateProjectDto` 里根本没有 slug 字段，slug 从未发给后端。后端 POST /api/projects 用名字重新生成 slug：

    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

该正则把所有非 [a-z0-9] 字符（含全部中文）替换成 -。纯中文名（如「用户系统」）→ 所有字符被替换为 - → 去首尾 - 后 slug = **空字符串**。slug 列是 notNull().unique()：第一个中文项目以空 slug 建成，第二个直接触发唯一约束冲突 500。空 slug 还会让 Mock URL 变成 //users（双斜杠）路由失效。

更早的矛盾：前端 generateSlug（保留中文）vs validateSlug（拒绝中文）vs 后端生成（再剥中文），三套逻辑互不一致。

**证据**：

- projects/new/page.tsx 的 canSubmit 与 checkSlugAvailability 全程围绕 slug，但提交体无 slug
- api/projects/route.ts:72 slug 生成正则不处理 CJK
- api-client.ts 的 CreateProjectDto 无 slug

**建议**：

1. CreateProjectDto 增加 `slug?: string`，后端 schema 加 `slug.optional()`，优先用提交值，为空时再生成。
2. 三处 slug 正则统一为一处（建议 src/lib/slug.ts），生成与校验共用。
3. 生成结果为空时拒绝并提示「请手动填写一个英文 slug」。

## [P1] 更新项目名会静默改写 slug，破坏既有 Mock URL

**位置**：`src/app/api/projects/[id]/route.ts:88` PUT/PATCH

**问题**：更新项目时若 data.name 有变化，后端无条件用新名字重新生成 slug 并覆盖。但 slug 是 Mock URL 前缀（`/{slug}/{path}`），改了名 = 所有客户端集成的 URL 全部失效，且无任何提示。项目详情页的编辑弹窗只让用户改名/描述，用户完全意识不到改名字会改 URL。另外更新时不做 slug 唯一性检查：两个项目改成同名 → 同 slug → 唯一约束 500。

**建议**：slug 一经创建不应随改名自动变更；如需变更，提供独立的「修改 slug」入口并显式校验唯一性 + 警告 URL 变更后果。

## [P1] slug 未保留系统路由名，可创建 slug=api/share/settings 影子路由

**位置**：`src/app/api/projects/check-slug/route.ts`、`src/app/api/projects/route.ts:72`

**问题**：check-slug 只比对已存在 slug，不拦截保留字。用户能创建 slug 为 api/share/settings/projects 的项目。Next.js 路由优先级下静态段会赢，但 catch-all `[project]/[...path]` 仍可能与不存在的子路径产生混淆（如 /api/users 到底命中 /api 还是 mock）。属安全隐患。

**建议**：维护保留字黑名单（api, share, settings, projects, health, metrics, admin），check-slug 与创建时一并拒绝。

## [P1] 项目详情/端点新建/端点详情全量拉取项目表只为取一条

**位置**：

- `src/app/projects/[id]/page.tsx` loadData
- `src/app/projects/[id]/endpoints/new/page.tsx` loadProject
- `src/app/projects/[id]/endpoints/[endpointId]/page.tsx` loadData

**问题**：三处都写成 `projectsApi.list().then(ps => ps.find(p => p.id === projectId))`，把整张 projects 表拉到前端再 find。已有 `projectsApi.get(id)`（命中 GET /api/projects/[id]）却完全没用。项目数增长后是纯浪费，且端点详情页每次进入都跑一次。

**建议**：三处改用 `projectsApi.get(projectId)`。

## [P1] GET /api/projects/[id] 返回 isActive 为整数，与列表/创建的布尔不一致

**位置**：`src/app/api/projects/[id]/route.ts:46`

**问题**：列表（GET /api/projects）和创建（POST）都做了 `isActive: Boolean(project.isActive)`，但 GET /api/projects/[id] 直接 `return success(projectList[0])`，返回整数 1/0。前端 Project.isActive 类型声明为 boolean，但实际拿到 number。依赖 isActive 做判断的代码会行为异常。

**证据**：route.ts:46 无 format；对比 api/projects/route.ts:33 的 format 函数。

**建议**：GET-by-id 同样套用 format 转布尔。

---

# 逐页面评审

## 1. 布局 `src/app/layout.tsx`

| 维度 | 评价 |
|---|---|
| 完整性 | 良好，字体、主题、Toast、Plausible、全局头部齐备 |
| 合理性 | 良好，next-themes + suppressHydrationWarning 防水合 |
| 一致性 | 见下 |
| 缺失 | 无 |

### [P2] 首页与布局 title 双重设置且不一致

**位置**：`src/app/layout.tsx:11` vs `src/app/page.tsx:11`

布局 metadata title = `ApiMock - API Mock Server`（英文），首页却在 useEffect 里 `document.title = 'ApiMock - AI 智能 Mock 平台'`（中文）。客户端覆盖 + 中英混用。应在首页用 Next.js `export const metadata` 统一，避免运行时改 title。

**结论**：布局本身无功能性缺陷，仅 title 治理问题。

---

## 2. 首页 `src/app/page.tsx`

| 维度 | 评价 |
|---|---|
| 完整性 | demo 内容失真 |
| 合理性 | 良好，Hero + 特性卡 + demo 区 + footer 结构完整 |
| 一致性 | demo 与真实 API 不符 |
| 缺失 | 无 |

### [P2] demo 示例域名写死为不存在的 mock.apimock.io

**位置**：`src/app/page.tsx:85`

demo 写 `curl https://mock.apimock.io/demo-project/users`，但 README 与实际部署用的是 `http://localhost:3000/demo-project/users` 或 Railway 域名。mock.apimock.io 是个用户够不到的域名，复制粘贴会失败。

### [P2] demo 响应体结构与真实 Mock 输出不一致

**位置**：`src/app/page.tsx:88`

demo 显示返回纯数组，但真实 AI 生成/seed 都输出 `{code, message, data:{list, total}}` 结构（见 mock-data-templates.ts、ai-presets.ts 的 SYSTEM_PROMPT）。用户照 demo 预期写解析会被真实返回打脸。

### [P3] useEffect 改 title 与布局 metadata 冲突

同布局章节 P2，根因在此页。建议删除 useEffect 改 title，改用静态 metadata。

**首页结论**：功能可用，主要是 demo 区误导性内容，影响首次体验的可信度。

---

## 3. 项目列表页 `src/app/projects/page.tsx`

| 维度 | 评价 |
|---|---|
| 完整性 | 良好，加载/错误/空/搜索无结果/分页/loading skeleton 全覆盖 |
| 合理性 | 良好，防抖搜索、demo 项目禁删、删除二次确认、移动端常驻操作按钮 |
| 一致性 | 良好，与 api-client 契约一致 |
| 缺失 | 无分页参数透传（见下） |

**这是 9 个页面里做得最扎实的一个。** 列表骨架、空态、无匹配态、分页、删除确认、demo 保护都到位。

### [P2] projectsApi.list() 无分页参数，前端全量拉取后切片分页

**位置**：`src/app/projects/page.tsx:32`、`src/lib/api-client.ts` list 签名

前端 loadProjects 拉全量后在前端 slice 分页。后端其实支持 ?page&pageSize（见 api/projects/route.ts），但 projectsApi.list() 不接受参数。项目数大时整表传输。

### [P2] 「编辑」按钮带 ?edit=true 但目标页不读取

**位置**：项目列表页编辑链接 `/projects/${id}?edit=true` → `src/app/projects/[id]/page.tsx`

列表卡片右上编辑铅笔跳转到项目详情页并附 ?edit=true，但项目详情页没有任何 useSearchParams 读取该参数，编辑弹窗不会自动打开。用户点编辑 = 跳到详情页无反应，功能名存实亡。

**建议**：项目详情页用 useSearchParams 读 edit，为 true 时 setIsEditDialogOpen(true)。

**列表页结论**：自身实现良好；唯一跨页面断点是 ?edit=true 未被消费。

---

## 4. 新建项目页 `src/app/projects/new/page.tsx`

| 维度 | 评价 |
|---|---|
| 完整性 | slug 链路断裂（见跨页面 P0） |
| 合理性 | 良好，实时校验、防抖查重、状态图标、成功引导弹窗 |
| 一致性 | 前端 generate/validate/后端 三套 slug 逻辑 |
| 缺失 | 无 |

### [P0] slug 从不提交 + CJK 项目名产空 slug

见跨页面 P0。本页是问题源头：精心做的 slug UI 是死的。

### [P2] generateSlug 保留中文但 validateSlug 拒绝中文

**位置**：`src/app/projects/new/page.tsx:62` vs `:75`

generateSlug 的正则保留中文，validateSlug 的正则拒绝中文。输入中文名 → 自动生成的 slug 直接被判非法 → slug 框常驻错误态。交互上一直误导用户「slug 有问题」。

### [P3] 描述字符计数器无长度强制

**位置**：`src/app/projects/new/page.tsx` 的 `{form.description.length}/500`

显示 500 上限但不校验，可超长提交。validate 函数里没有 description 校验。

**新建项目页结论**：UI/交互层做得细致，但被 slug 提交链路的 P0 拖累，核心数据流是断的。

---

## 5. 项目详情页 `src/app/projects/[id]/page.tsx`（1145 行）

| 维度 | 评价 |
|---|---|
| 完整性 | 良好，端点列表+请求记录双 Tab、分页、筛选、导入、编辑、删除、空项目引导 |
| 合理性 | 良好，端点/请求双 Tab、防抖搜索、分页、删除二次确认、空项目引导弹窗 |
| 一致性 | 全量拉项目 + isActive 类型 |
| 缺失 | 见 tags |

### [P1] 全量拉取项目列表 find 单条（跨页面）

见跨页面 P1。本页 loadData 是其中一处。

### [P2] ?edit=true 未消费

见列表页 P2。

### [P2] 端点列表支持按 tag 筛选，但无任何创建/编辑入口能写 tag

**位置**：项目详情页 tagFilter 输入框 + api-client Endpoint.tags

项目详情页有「标签」筛选框，schema 也有 tags 列，但端点新建页和端点详情页表单都没有 tag 编辑控件。tag 永远是默认 []，筛选框永远筛不出东西。这是一个「声称支持但无法产生数据」的功能缺口。

**建议**：在端点表单加 tag 编辑（逗号分隔输入即可），或在文档里明确移除该筛选。

### [P3] 请求记录 Tab 切入才加载，但 endpointFilter 依赖已加载的 endpoints

**位置**：`src/app/projects/[id]/page.tsx` loadRequests 与 endpoints 联动

请求记录 Tab 的端点下拉用 endpoints state，而 endpoints 在「端点列表」Tab 受筛选/分页影响（只含当前页）。切到请求 Tab 时下拉只列当前页端点，筛选范围不完整。影响中等。

**项目详情页结论**：功能最全，双 Tab + 导入 + 引导都到位；主要问题是跨页面的全量拉取，以及 tags 功能链断开。

---

## 6. 端点新建页 `src/app/projects/[id]/endpoints/new/page.tsx`（630 行）

| 维度 | 评价 |
|---|---|
| 完整性 | 良好，方法/路径/名称/描述/延迟/状态码/Content-Type/响应体/JSON 校验全覆盖 |
| 合理性 | 良好，URL 实时预览、路径模板快捷按钮、常用状态码网格、创建并继续 |
| 一致性 | 全量拉项目 |
| 缺失 | tags（同上）、路径参数无校验 |

### [P1] loadProject 全量拉取（跨页面）

见跨页面 P1。

### [P3] 路径参数（:id）无格式校验与提示

**位置**：`endpoints/new/page.tsx` validatePath

validatePath 只查空，不校验 :param 写法合法性（如 /:、/users/:、嵌套 :a/:b/c）。异常写法能存进去，到 Mock 路由匹配时按 / 分段 + startsWith(':') 判断，半残路径会匹配失败但无前端提示。

### [P3] 缺少 tags 编辑入口

同项目详情页 P2，端点表单无 tag 控件。

**端点新建页结论**：表单质量高（状态码网格、URL 预览、JSON 校验很用心），主要欠 tags 与路径参数校验。

---

## 7. 端点详情页 `src/app/projects/[id]/endpoints/[endpointId]/page.tsx`（1047 行，最复杂）

| 维度 | 评价 |
|---|---|
| 完整性 | 良好，基本信息编辑+AI 生成+模板库+错误场景+响应规则+请求记录+未保存守卫 |
| 合理性 | 良好，isDirty 未保存守卫（beforeunload + 路由拦截 + 弹窗）、Tab 化高级功能 |
| 一致性 | 全量拉项目 + 错误场景双份常量 |
| 缺失 | tags 编辑 |

### [P2] QUICK_ERROR_SCENARIOS 与 lib/error-scenarios.ts 重复且不同步

**位置**：`src/app/projects/[id]/endpoints/[endpointId]/page.tsx:24` QUICK_ERROR_SCENARIOS vs `src/lib/error-scenarios.ts` ERROR_SCENARIOS

页面顶部硬编码了一份「快速错误场景」（500/404/401/403/超时 5s），同时通过 ErrorScenariosSelector 组件又引入 lib/error-scenarios.ts 的完整 12 种场景。两份常量内容相近但独立维护：lib 里的超时是 408+30s，页面里是 200+5s；lib 有 502/503/504/400/网络错误等，页面快捷版没有。改一处忘改另一处必然漂移。

**建议**：删除页面内 QUICK_ERROR_SCENARIOS，从 lib 派生一个「常用子集」。

### [P2] 全量拉项目（跨页面）

见跨页面 P1。

### [P3] 缺少 tags 编辑入口

同上。

### [P3] handleQuickErrorScenario 与 handleApplyErrorScenario 逻辑重复

**位置**：端点详情页两处 handler

两个 handler 几乎一样，只是数据源不同（一份本地常量、一份 lib）。合并后随 P2 删除本地常量自然消失。

**端点详情页结论**：功能集成度最高（6 类高级能力），未保存守卫做得专业；主要是错误场景常量重复维护的隐患。

---

## 8. AI 设置页 `src/app/settings/ai/page.tsx`

| 维度 | 评价 |
|---|---|
| 完整性 | 无任何失败反馈 |
| 合理性 | CRUD 失败静默 |
| 一致性 | 未走 api-client，直接 fetch |
| 缺失 | 无预算/用量展示 |

### [P2] 所有 fetch 失败只 console.error，用户无感知

**位置**：`src/app/settings/ai/page.tsx` 的五个 handler（loadProviders/handleAddProvider/handleUpdateProvider/handleDeleteProvider/handleSetDefault）

五个 handler 全是 `catch (err) { console.error(...) }`，没有任何 toast 或错误态。用户点「添加模型」若失败（网络/重复名/key 非法），页面毫无反应，只能去控制台翻日志。对比项目列表/端点页都有 useToast 反馈，这里完全缺失。更严重的是 loadProviders 失败也只 console.error，loading 置 false 后页面停在空列表，用户以为是「没配置过」而非「加载失败」。

**建议**：引入 useToast，失败时提示；loadProviders 失败设 error 态并展示重试。

### [P2] 直接 fetch 绕过 api-client，与项目/端点页风格不一致

**位置**：整页

项目/端点页统一走 projectsApi/endpointsApi（带类型 + ApiError 抛出），AI 设置页却全部裸 `fetch('/api/ai/providers')` 手写。错误处理、类型、风格三不齐。api-client.ts 里也没有 aiProvidersApi 封装。

**建议**：补 aiProvidersApi 封装，本页改用，统一错误模型。

### [P3] 未展示 AI 预算/用量

**位置**：本页 vs `src/lib/ai-budget.ts`

后端有完整的日预算机制（token/请求数双轴 + getBudgetStatus），metrics 也有 ai_budget_remaining，但 AI 设置页完全不展示当日用量/剩余额度。用户无法直观感知「还剩多少配额」「为什么降级到模板了」。这是 PRD 头号风险点（成本失控）却对用户不可见。

**建议**：在设置页顶部展示 getBudgetStatus 数据（今日 token/请求、限额、剩余）。

**AI 设置页结论**：功能能跑，但错误反馈缺失 + 绕过 api-client 是明显短板，预算不可见是体验缺口。

---

## 9. 分享页 `src/app/share/[slug]/page.tsx`

| 维度 | 评价 |
|---|---|
| 完整性 | 良好，项目信息+端点列表+详情面板+在线测试+复制 URL+noindex |
| 合理性 | 详情/测试按钮失效（见 P1） |
| 一致性 | noindex 用运行时 DOM 注入 |
| 缺失 | 全量 responseBody 暴露 |

### [P1] 「详情」「测试」按钮用 DOM 查询 + click 触发，实际点不动

**位置**：`src/app/share/[slug]/page.tsx` 端点行的「详情」「测试」按钮

按钮 onClick 里写 `document.querySelectorAll('[data-detail-toggle]').forEach(...)` 然后对匹配 endpoint-id 的元素再 .click()。但控制面板展开的是 EndpointDetailPanel/EndpointTestPanel 各自内部的独立按钮（它们有自己的 isExpanded 状态）。外层按钮通过 DOM 模拟点击的不是控制状态的那个按钮——它选中并点击的仍是自己（data-detail-toggle 同时挂在外层按钮上）。结果是点「详情/测试」面板不展开。这是该页核心交互的功能性失效。

**建议**：改用受控展开状态（父组件持有 expandedId，传给面板的 isExpanded/onToggle），彻底去掉 DOM 查询 hack。

### [P2] noindex 用 useEffect 动态插 meta，SSR 阶段无防护

**位置**：`src/app/share/[slug]/page.tsx` useEffect 插 robots meta

分享页用 useEffect 在客户端 `document.head.appendChild` 插 robots meta。但 SSR 输出的 HTML 不含该 meta，爬虫若不执行 JS（多数搜索引擎的初轮抓取）仍会索引。且组件卸载时 removeChild 若 meta 因 HMR 等被重复插入会报错。

**建议**：用 Next.js `export const metadata = { robots: { index: false, follow: false } }` 在 share/[slug]/layout.tsx 静态输出。

### [P2] 在线测试通过浏览器直连 Mock URL，受 CORS/同源限制

**位置**：EndpointTestPanel.sendRequest

测试面板 fetch(fullUrl) 直连 `${baseUrl}${endpoint.path}`，baseUrl 来自服务端拼接（含 origin）。跨域部署或 baseUrl 为外部域名时浏览器策略可能阻断。主要风险是跨域场景下测试功能静默失败。

**建议**：文档说明需同源，或测试请求走服务端代理转发。

### [P2] 分享页向匿名访客全量暴露所有端点 responseBody

**位置**：`src/app/api/share/[slug]/route.ts`

分享接口返回每个端点的完整 responseBody，分享页也完整渲染。任何拿到分享链接的人都能看到全部 Mock 数据。对于「对接文档」场景合理，但如果用户把含敏感/测试数据的端点放在分享项目里，无任何可见性控制（没有端点级分享开关）。

**建议**：增加端点级 isShareable 开关，或在项目设置里提供「仅展示路径不展示响应体」选项。

**分享页结论**：UI 信息密度好，但「详情/测试」按钮失效是硬伤，需优先修。

---

# 修复优先级建议

**第一优先（P0/P1，数据与核心交互）**

1. 修 slug 提交链路（P0）—— 新建项目真正提交 slug + 三处正则统一 + 空 slug 拒绝
2. slug 保留字拦截（P1）
3. 改名不再静默改 slug（P1）
4. 分享页详情/测试按钮改受控展开（P1）
5. GET /api/projects/[id] isActive 转布尔（P1）
6. 三处全量拉取改 projectsApi.get（P1）

**第二优先（P2，体验与一致性）**

7. 项目列表 ?edit=true 在详情页消费
8. AI 设置页失败加 toast + 补 api-client 封装
9. 端点表单补 tags 编辑（打通筛选链路）
10. 删除端点详情页重复的 QUICK_ERROR_SCENARIOS
11. 首页 demo 域名/响应体修正
12. 分享页 noindex 改静态 metadata

**第三优先（P3，增强）**

13. AI 设置页展示预算用量
14. 端点路径参数校验
15. 描述长度强制校验
16. share 端点级可见性开关

---

# 测试覆盖建议

- **单测**：slug 生成/校验（中文/纯符号/空结果）、projectsApi.get vs list 行为
- **E2E**：新建纯中文名项目应失败或要求手填 slug；分享页点「详情」面板应展开；AI 设置添加失败应出 toast；项目改名后 Mock URL 不应变
- **契约测试**：GET /api/projects/[id] 的 isActive 类型与列表一致

# 总结

项目整体完成度高：核心 Mock 服务、AI 生成降级链、OpenAPI 导入、响应规则匹配、运维可观测性都实现完整且考虑了边界（限流/预算/SSRF/加密）。9 个页面里项目列表、端点新建/详情的表单交互质量明显高于平均。

主要风险集中在**项目元数据（slug）这一条数据流**上：UI 收集、前端校验、后端生成三者脱节，导致 P0（空 slug）和一系列 P1（改名改 URL、保留字、类型不一致）。其次是几个**交互链路断点**（?edit=true 不消费、分享页按钮失效、tags 无写入入口）和**错误反馈缺失**（AI 设置页静默失败）。

按上面的优先级修完第一档 6 项，项目的数据完整性和核心交互就能闭环。
