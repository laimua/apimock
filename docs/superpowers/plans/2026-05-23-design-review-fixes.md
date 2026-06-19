# Design Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 categories of UI/UX issues identified in design review — global nav, mobile accessibility, AI slop, duplicate constants, loading states, icon unification, delete consolidation.

**Architecture:** Extract shared constants and hooks first, then build GlobalHeader component, then fix pages in dependency order. All changes are frontend-only with no database or API modifications.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, lucide-react, TypeScript

---

### Task 1: Create `lib/constants.ts`

**Files:**
- Create: `src/lib/constants.ts`

- [ ] **Step 1: Create the constants file**

```typescript
export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

export type Method = (typeof METHODS)[number];

export const COMMON_STATUS_CODES = [
  { value: 200, label: '200 OK', description: '请求成功' },
  { value: 201, label: '201 Created', description: '资源创建成功' },
  { value: 204, label: '204 No Content', description: '无内容返回' },
  { value: 400, label: '400 Bad Request', description: '请求参数错误' },
  { value: 401, label: '401 Unauthorized', description: '未授权' },
  { value: 403, label: '403 Forbidden', description: '禁止访问' },
  { value: 404, label: '404 Not Found', description: '资源不存在' },
  { value: 500, label: '500 Internal Server Error', description: '服务器内部错误' },
] as const;

export const STATUS_CODES = [
  ...COMMON_STATUS_CODES,
  { value: 301, label: '301 Moved Permanently', description: '永久重定向' },
  { value: 302, label: '302 Found', description: '临时重定向' },
  { value: 304, label: '304 Not Modified', description: '资源未修改' },
  { value: 405, label: '405 Method Not Allowed', description: '方法不允许' },
  { value: 408, label: '408 Request Timeout', description: '请求超时' },
  { value: 409, label: '409 Conflict', description: '资源冲突' },
  { value: 422, label: '422 Unprocessable Entity', description: '无法处理的实体' },
  { value: 429, label: '429 Too Many Requests', description: '请求过于频繁' },
  { value: 502, label: '502 Bad Gateway', description: '网关错误' },
  { value: 503, label: '503 Service Unavailable', description: '服务不可用' },
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: add centralized constants for HTTP methods and status codes"
```

---

### Task 2: Create `lib/hooks.ts` with useDebounce

**Files:**
- Create: `src/lib/hooks.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
'use client';

import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/hooks.ts
git commit -m "feat: add useDebounce hook with 300ms default"
```

---

### Task 3: Update endpoint pages to use shared constants

**Files:**
- Modify: `src/app/projects/[id]/endpoints/new/page.tsx`
- Modify: `src/app/projects/[id]/endpoints/[endpointId]/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Update `endpoints/new/page.tsx`**

Remove local `METHODS`, `COMMON_STATUS_CODES`, and `STATUS_CODES` definitions. Add import at top:

```typescript
import { METHODS, STATUS_CODES, COMMON_STATUS_CODES } from '@/lib/constants';
```

Remove the lines that define these constants locally (approximately lines 22-55 containing `const METHODS = [...]`, `const COMMON_STATUS_CODES = [...]`, `const STATUS_CODES = [...]`).

- [ ] **Step 2: Update `endpoints/[endpointId]/page.tsx`**

Same pattern — remove local constant definitions and add import:

```typescript
import { METHODS, STATUS_CODES, COMMON_STATUS_CODES } from '@/lib/constants';
```

- [ ] **Step 3: Update `projects/[id]/page.tsx`**

This file may define its own METHODS array. Remove local definition and add import:

```typescript
import { METHODS } from '@/lib/constants';
```

- [ ] **Step 4: Verify no duplicate definitions**

Run: `grep -r "const METHODS" src/`
Expected: only `src/lib/constants.ts` appears.

Run: `grep -r "const COMMON_STATUS_CODES" src/`
Expected: only `src/lib/constants.ts` appears.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[id]/endpoints/new/page.tsx src/app/projects/[id]/endpoints/[endpointId]/page.tsx src/app/projects/[id]/page.tsx
git commit -m "refactor: replace duplicate constants with imports from lib/constants"
```

---

### Task 4: Create GlobalHeader component

**Files:**
- Create: `src/components/layout/GlobalHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Plus } from 'lucide-react';

const navLinks = [
  { href: '/projects', label: 'Projects' },
  { href: '/settings/ai', label: 'AI Settings' },
];

export default function GlobalHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-blue-600 text-xl">M</span>
            <span>Api<span className="text-blue-600">Mock</span></span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'text-blue-600 border-b-2 border-blue-600 pb-0.5'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 text-gray-600"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-gray-200 bg-white">
          <nav className="flex flex-col px-4 py-3 gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`text-sm font-medium ${
                  isActive(link.href) ? 'text-blue-600' : 'text-gray-600'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/projects/new"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg justify-center"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/GlobalHeader.tsx
git commit -m "feat: add GlobalHeader component with mobile hamburger menu"
```

---

### Task 5: Wire GlobalHeader into layout and remove per-page headers

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`
- Modify: `src/app/projects/new/page.tsx`
- Modify: `src/app/settings/ai/page.tsx`

- [ ] **Step 1: Add GlobalHeader to `app/layout.tsx`**

Add import and insert `<GlobalHeader />` before `<ToastProvider>`:

```tsx
import GlobalHeader from '@/components/layout/GlobalHeader';
// ...
<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
  <GlobalHeader />
  <ToastProvider>{children}</ToastProvider>
</body>
```

- [ ] **Step 2: Remove header from `app/page.tsx`**

Remove the entire header/nav section (lines ~18-93 containing `<header>`, `<nav>`, the logo and desktop/mobile navigation). Keep only the hero section and feature cards below it.

- [ ] **Step 3: Remove header from `app/projects/page.tsx`**

Remove the page-specific header block (lines ~90-139). Add a breadcrumb above the content if needed:

```tsx
<div className="mb-4 text-sm text-gray-500">
  <Link href="/" className="hover:text-gray-700">Home</Link>
  <span className="mx-1">/</span>
  <span className="text-gray-900">Projects</span>
</div>
```

- [ ] **Step 4: Remove header from `app/projects/[id]/page.tsx`**

Remove the page-specific header block (lines ~621-697). Add breadcrumb with project name:

```tsx
<div className="mb-4 text-sm text-gray-500">
  <Link href="/" className="hover:text-gray-700">Home</Link>
  <span className="mx-1">/</span>
  <Link href="/projects" className="hover:text-gray-700">Projects</Link>
  <span className="mx-1">/</span>
  <span className="text-gray-900">{project.name}</span>
</div>
```

- [ ] **Step 5: Remove header from `app/projects/new/page.tsx`**

Remove the page-specific header block (lines ~235-243). Add breadcrumb:

```tsx
<div className="mb-4 text-sm text-gray-500">
  <Link href="/" className="hover:text-gray-700">Home</Link>
  <span className="mx-1">/</span>
  <Link href="/projects" className="hover:text-gray-700">Projects</Link>
  <span className="mx-1">/</span>
  <span className="text-gray-900">New</span>
</div>
```

- [ ] **Step 6: Remove header from `app/settings/ai/page.tsx`**

Remove the page-specific header block. Add breadcrumb:

```tsx
<div className="mb-4 text-sm text-gray-500">
  <Link href="/" className="hover:text-gray-700">Home</Link>
  <span className="mx-1">/</span>
  <span className="text-gray-900">AI Settings</span>
</div>
```

- [ ] **Step 7: Verify build passes**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/app/projects/page.tsx src/app/projects/[id]/page.tsx src/app/projects/new/page.tsx src/app/settings/ai/page.tsx
git commit -m "feat: wire GlobalHeader into layout, remove per-page headers, add breadcrumbs"
```

---

### Task 6: Delete unused Header and Sidebar

**Files:**
- Delete: `src/components/layout/Header.tsx`
- Delete: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Verify no imports exist**

Run: `grep -r "from.*components/layout/Header" src/`
Expected: no results.

Run: `grep -r "from.*components/layout/Sidebar" src/`
Expected: no results.

- [ ] **Step 2: Delete files**

```bash
rm src/components/layout/Header.tsx src/components/layout/Sidebar.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -u src/components/layout/Header.tsx src/components/layout/Sidebar.tsx
git commit -m "chore: delete unused Header and Sidebar components"
```

---

### Task 7: Fix homepage AI slop — replace emoji, swap CTA, break symmetry

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace emoji with lucide icons in FeatureCard**

Add import:

```typescript
import { Bot, Zap, Wrench } from 'lucide-react';
```

Find the three FeatureCard usages. Replace emoji strings with icon components:

```tsx
{/* Card 1 — wider */}
<FeatureCard
  icon={<Bot className="w-8 h-8 text-blue-600" />}
  title="AI 智能生成"
  description="输入自然语言描述，AI 自动生成完整的 API Mock 数据，包括路径、参数、响应体等。"
/>

{/* Card 2 */}
<FeatureCard
  icon={<Zap className="w-8 h-8 text-amber-500" />}
  title="即时生效"
  description="创建或修改 Mock API 后立即生效，无需重启服务，支持热更新。"
/>

{/* Card 3 */}
<FeatureCard
  icon={<Wrench className="w-8 h-8 text-emerald-600" />}
  title="灵活配置"
  description="自定义请求方法、状态码、响应头和响应体，支持动态模板和正则匹配。"
/>
```

- [ ] **Step 2: Update FeatureCard component signature**

Change the FeatureCard component to accept a ReactNode icon instead of string emoji:

```tsx
function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="p-6">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </Card>
  );
}
```

- [ ] **Step 3: Break 3-column symmetry**

Change the feature cards grid from symmetric to asymmetric:

```tsx
{/* Find the grid div wrapping the FeatureCards and update */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {/* Make first card span 2 columns on desktop */}
  <div className="md:col-span-2">
    <FeatureCard
      icon={<Bot className="w-8 h-8 text-blue-600" />}
      title="AI 智能生成"
      description="输入自然语言描述，AI 自动生成完整的 API Mock 数据，包括路径、参数、响应体等。"
    />
  </div>
  <div className="md:row-span-1">
    <FeatureCard
      icon={<Zap className="w-8 h-8 text-amber-500" />}
      title="即时生效"
      description="创建或修改 Mock API 后立即生效，无需重启服务，支持热更新。"
    />
  </div>
</div>
{/* Second row */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
  <div className="md:col-span-2">
    <FeatureCard
      icon={<Wrench className="w-8 h-8 text-emerald-600" />}
      title="灵活配置"
      description="自定义请求方法、状态码、响应头和响应体，支持动态模板和正则匹配。"
    />
  </div>
</div>
```

Adjust grid to use asymmetric layout. The key: first card wider than others, avoid perfect 3-column symmetry.

- [ ] **Step 4: Swap CTA priority**

Find the hero CTA buttons and swap order/styling:

```tsx
<div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
  <Link
    href="/projects"
    className="inline-flex items-center justify-center bg-blue-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
  >
    My Projects
  </Link>
  <Link
    href="/projects/new"
    className="inline-flex items-center justify-center border border-gray-300 text-gray-700 font-medium px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
  >
    Quick Start
  </Link>
</div>
```

"My Projects" = primary (blue bg), "Quick Start" = secondary (border).

- [ ] **Step 5: Verify no emoji remain**

Run: `grep -Pn '[\x{1F300}-\x{1F9FF}]' src/app/page.tsx`
Expected: no results.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix: replace emoji with lucide icons, swap CTA priority, break grid symmetry"
```

---

### Task 8: Fix mobile button visibility

**Files:**
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Fix hover-only buttons in `projects/page.tsx`**

Find all instances of `opacity-0 group-hover:opacity-100` on action buttons (edit, delete). Replace with:

```
sm:opacity-0 sm:group-hover:opacity-100
```

This makes buttons always visible on mobile, hover-revealed on desktop (>= 640px).

- [ ] **Step 2: Fix hover-only buttons in `projects/[id]/page.tsx`**

Same pattern — find all `opacity-0 group-hover:opacity-100` and add `sm:` prefix:

```
sm:opacity-0 sm:group-hover:opacity-100
```

- [ ] **Step 3: Commit**

```bash
git add src/app/projects/page.tsx src/app/projects/[id]/page.tsx
git commit -m "fix: make action buttons visible on mobile, hover-reveal on desktop"
```

---

### Task 9: Add search debounce

**Files:**
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Add debounce to `projects/page.tsx`**

Add import:

```typescript
import { useDebounce } from '@/lib/hooks';
```

In the component, after the search state:

```typescript
const [searchQuery, setSearchQuery] = useState('');
const debouncedSearch = useDebounce(searchQuery, 300);
```

Update the useEffect or fetch call to use `debouncedSearch` instead of `searchQuery` as the dependency.

- [ ] **Step 2: Add debounce to `projects/[id]/page.tsx`**

Same pattern:

```typescript
import { useDebounce } from '@/lib/hooks';
// ...
const [endpointSearch, setEndpointSearch] = useState('');
const debouncedEndpointSearch = useDebounce(endpointSearch, 300);
```

Update search filtering to use `debouncedEndpointSearch`.

- [ ] **Step 3: Commit**

```bash
git add src/app/projects/page.tsx src/app/projects/[id]/page.tsx
git commit -m "feat: add 300ms debounce to search inputs"
```

---

### Task 10: Consolidate delete actions

**Files:**
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Remove duplicate delete button from empty endpoint state**

In `projects/[id]/page.tsx`, find the empty state section (when project has zero endpoints). Remove the delete button from there. Delete should only appear in the project info card.

- [ ] **Step 2: Replace `confirm()` with ConfirmDialog**

Find all `confirm(` calls in the file. Replace with the existing ConfirmDialog component pattern:

```tsx
const [showDeleteDialog, setShowDeleteDialog] = useState(false);
// ...
<ConfirmDialog
  open={showDeleteDialog}
  onOpenChange={setShowDeleteDialog}
  title="Delete Project"
  description="Are you sure you want to delete this project? This action cannot be undone."
  confirmText="Delete"
  variant="danger"
  onConfirm={handleDelete}
/>
```

- [ ] **Step 3: Verify single delete entry point**

Search the file for all delete button instances. Expected: exactly one visible delete trigger per page.

- [ ] **Step 4: Commit**

```bash
git add src/app/projects/[id]/page.tsx
git commit -m "fix: consolidate delete to single entry point, use ConfirmDialog"
```

---

### Task 11: Add Skeleton loading states

**Files:**
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/settings/ai/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Replace loading text in `projects/page.tsx`**

Import Skeleton:

```typescript
import { Skeleton } from '@/components/ui/Skeleton';
```

Replace the loading state `"Loading..."` with:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {[1, 2, 3, 4, 5, 6].map((i) => (
    <div key={i} className="border rounded-lg p-6">
      <Skeleton className="h-6 w-3/4 mb-4" />
      <Skeleton className="h-4 w-1/2 mb-2" />
      <Skeleton className="h-4 w-full" />
    </div>
  ))}
</div>
```

- [ ] **Step 2: Replace loading state in `settings/ai/page.tsx`**

Add Skeleton import and replace any loading content with skeleton cards matching the provider card layout.

- [ ] **Step 3: Replace loading text in requests tab of `projects/[id]/page.tsx`**

Find the requests tab loading state and replace with skeleton rows.

- [ ] **Step 4: Commit**

```bash
git add src/app/projects/page.tsx src/app/settings/ai/page.tsx src/app/projects/[id]/page.tsx
git commit -m "feat: replace Loading text with Skeleton components"
```

---

### Task 12: Add aria-labels to icon-only buttons

**Files:**
- Modify: All page files with icon-only `<button>` elements

- [ ] **Step 1: Audit and fix `projects/page.tsx`**

Find all `<button>` elements containing only icons (no visible text). Add `aria-label`:

```tsx
<button aria-label="Edit project" ...>
<button aria-label="Delete project" ...>
```

- [ ] **Step 2: Audit and fix `projects/[id]/page.tsx`**

Same pattern — find icon-only buttons and add descriptive aria-labels.

- [ ] **Step 3: Audit and fix `projects/new/page.tsx`**

Check for any icon-only buttons.

- [ ] **Step 4: Audit and fix `settings/ai/page.tsx`**

Check for any icon-only buttons.

- [ ] **Step 5: Verify**

Run: `grep -rn '<button' src/app/ | grep -v 'aria-label' | grep -v '>'`
Manually review any results to confirm they contain visible text.

- [ ] **Step 6: Commit**

```bash
git add src/app/
git commit -m "a11y: add aria-labels to all icon-only buttons"
```

---

### Task 13: Final verification

- [ ] **Step 1: Build check**

Run: `pnpm build`
Expected: clean build, no errors.

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: no new warnings.

- [ ] **Step 3: Verify constants deduplicated**

Run: `grep -r "const METHODS" src/`
Expected: only `src/lib/constants.ts`.

- [ ] **Step 4: Verify no inline SVG icons**

Run: `grep -r "<svg" src/app/`
Expected: no standalone icon SVGs (only acceptable in code blocks/pre tags).

- [ ] **Step 5: Verify no deleted component imports**

Run: `grep -r "from.*layout/Header\|from.*layout/Sidebar" src/`
Expected: no results.

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: final cleanup after design review fixes"
```
