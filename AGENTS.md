# AGENTS.md — AI 协作约定

> 本文件给所有 AI agent CLI(ZCode / Codex / Claude Code / Kimi 等)读。
> 任何 session 开始时,先读本文件了解项目协作约定。

## 多 Agent 协作(重要)

本项目用**多个真实 AI CLI 工具**协作,**不是**让一个 agent 用 subagent 扮演其它角色。各工具都是装好可直接调用的命令行程序:

| 角色 | 工具 | 调用命令 | 典型用途 |
|------|------|----------|----------|
| **kimi** | Kimi Code (Moonshot) | `kimi -p "<prompt>"`(stdin 传大量内容) | 前端 / 部署形态判断 / 独立复审 |
| **cc** | Claude Code (Anthropic) | `claude -p "<prompt>"` | 后端实现 / 代码生成 |
| **codex** | Codex CLI (OpenAI) | `codex exec "<prompt>"` 或 `codex review` | 验收 / 代码审查 / 独立判断 |
| ZCode(我) | ZCode | (当前会话) | 总控 / 协调 / 派发 / 跑命令 |

### 关键调用约定

1. **传大量内容用 stdin,不要塞命令行参数** —— 会触发 `Argument list too long`。例:
   ```bash
   cat /tmp/some.diff | codex exec --skip-git-repo-check "复审这份 diff: $(cat)"
   # 或
   cat file | kimi -p "看 stdin 的内容..."
   ```
2. **每个 CLI 单次调用 5-7 分钟**,串行跑要排队;不冲突时可并行。
3. **真多模型交叉验证 > 单模型 subagent 模拟**。需要"独立验收/第二意见"时,**用真 CLI**,不要起 subagent 扮演(同模型模拟有盲区)。
4. **CLI 路径**(若 PATH 找不到):
   - kimi: `/c/Users/M/.kimi-code/bin/kimi`
   - codex: `/d/software/node/node_global/codex`
   - claude: `/c/Users/M/.local/bin/claude`

### 谁定方案 / 谁执行

- **总控(ZCode)** 派任务、传话、裁决分歧、跑命令、提交
- 分歧无法定时,**指定一个角色拍板**(如本轮收尾由 kimi 定方案 A)
- 代码改动由 **cc(后端)/ kimi(前端)** 做,**codex 验收**,ZCode 不亲自写实现(只小修补丁例外)

## 测试与门禁(教训固化)

**所有门禁必须用空库 + 两个 tsc 跑**,不能只信本地默认 db(有残留表会蒙混):

```bash
export PATH="/d/software/nvm/v22.22.1:$PATH"   # Node 22 必需(默认 16 跑不了 vitest)
rm -f /tmp/clean-test.db
SQLITE_PATH=/tmp/clean-test.db npx tsc --noEmit                    # 主 tsc
SQLITE_PATH=/tmp/clean-test.db npx tsc --noEmit -p tsconfig.test.json   # test tsc(务必也跑)
SQLITE_PATH=/tmp/clean-test.db npx vitest run                       # 全量测试
npx eslint .                                                         # 0 error,关注 warning
```

**踩过的坑**(避免重蹈):
- 测试依赖生产 db 残留表 → 本地"全绿"是假象,CI 干净环境挂
- 只跑主 tsc 漏 test tsc → 测试代码类型错误 CI 挂
- Unit 绿 ≠ E2E 绿(P2-38 改 X-Mock-Endpoint 编码破坏 E2E 断言)
- subagent 共享主工作区,**不能并行 git 操作**(会卷入彼此改动)→ 严格串行

## 技术栈(CLAUDE.md 里 "API: Hono" 是错的)

- 语言: TypeScript 5.x (strict)
- 框架: **Next.js 16 (App Router)** —— route handlers 是 Next 的,不是 Hono(package.json 有 Hono 依赖但 src 零引用)
- UI: Tailwind CSS 4 + Lucide React
- 数据库: Drizzle ORM + better-sqlite3(默认)/ mysql2(可选,双栈)
- 校验: Zod
- 测试: Vitest(单元) + Playwright(E2E,CI 含)
- CI: GitHub Actions(Lint + Unit + Build + E2E),PR 必须全绿才合

## 代码审查相关文档

- `docs/CODE-REVIEW-2026-07-25.md` —— 审查报告(P0×1 + P1×19 + P2×55)
- `docs/CODE-REVIEW-FIX-COMPLETE-2026-07-26.md` —— 修复完成报告(已修 P0+P1 全 + P2 43/55)
- `docs/CODE-REVIEW-ACCEPTANCE-PLAN.md` —— 验收计划
- `docs/API-ERROR-SHAPE.md` —— 服务端错误形状契约
- `docs/DEPLOY.md` —— 部署指南(含限流/缓存/TRUST_PROXY 语义)

## 分支与提交

- 主分支 `master`,feature 分支 `fix/...` 或 `feat/...`
- PR 走 squash merge,CI 全绿(含 E2E)才合
- 提交信息中文,首行 `<type>(<scope>): <摘要>`,type 用 fix/feat/perf/refactor/test/docs
