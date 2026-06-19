## 1. Constants & Utilities

- [x] 1.1 Create `lib/constants.ts` with METHODS, COMMON_STATUS_CODES, STATUS_CODES
- [x] 1.2 Create `lib/hooks.ts` with useDebounce hook (300ms default)
- [x] 1.3 Update `endpoints/new/page.tsx` to import METHODS and STATUS_CODES from lib/constants
- [x] 1.4 Update `endpoints/[endpointId]/page.tsx` to import METHODS and STATUS_CODES from lib/constants
- [x] 1.5 Update `projects/[id]/page.tsx` to import METHODS from lib/constants
- [x] 1.6 Verify: `grep -r "const METHODS" src/` returns only lib/constants.ts

## 2. Global Navigation

- [x] 2.1 Create `components/layout/GlobalHeader.tsx` with brand logo, nav links (Projects, AI Settings), New Project CTA, mobile hamburger menu, current page highlighting
- [x] 2.2 Add GlobalHeader to `app/layout.tsx`
- [x] 2.3 Remove per-page header from `app/page.tsx` (keep hero content only)
- [x] 2.4 Remove per-page header from `app/projects/page.tsx` (add breadcrumb if needed)
- [x] 2.5 Remove per-page header from `app/projects/[id]/page.tsx` (add breadcrumb: Projects > Project Name)
- [x] 2.6 Remove per-page header from `app/projects/new/page.tsx` (add breadcrumb: Projects > New)
- [x] 2.7 Remove per-page header from `app/settings/ai/page.tsx` (add breadcrumb if needed)
- [x] 2.8 Delete `components/layout/Header.tsx` and `components/layout/Sidebar.tsx`
- [x] 2.9 Verify: no imports of deleted Header/Sidebar components remain

## 3. Homepage Redesign

- [x] 3.1 Replace emoji icons with lucide-react icons (Bot, Zap, Wrench) in FeatureCard
- [x] 3.2 Break 3-column symmetry: use asymmetric grid layout
- [x] 3.3 Swap CTA priority: "My Projects" as primary (blue bg), "Quick Start" as secondary (border)
- [x] 3.4 Verify: no emoji characters remain in FeatureCard components

## 4. Mobile Accessibility

- [x] 4.1 Fix hover-only buttons in `projects/page.tsx`: change to `sm:opacity-0 sm:group-hover:opacity-100`
- [x] 4.2 Add debounce to search in `projects/[id]/page.tsx` using useDebounce hook
- [x] 4.3 Add debounce to search in `projects/page.tsx` using useDebounce hook
- [x] 4.4 Add aria-label to all icon-only buttons across all pages
- [x] 4.5 Verify: test on mobile viewport, action buttons visible without hover

## 5. Delete Action Consolidation

- [x] 5.1 Remove duplicate delete button from empty endpoint state in `projects/[id]/page.tsx`
- [x] 5.2 Replace `confirm()` calls in `projects/[id]/page.tsx` with ConfirmDialog component
- [x] 5.3 Verify: delete button appears once per page, uses ConfirmDialog

## 6. Loading States

- [x] 6.1 Replace "Loading..." text with Skeleton components in `projects/page.tsx`
- [x] 6.2 Replace "Loading..." text with Skeleton components in `settings/ai/page.tsx`
- [x] 6.3 Replace "Loading..." text with Skeleton components in request records tab
- [x] 6.4 Verify: all list pages use Skeleton during loading

## 7. Icon Unification

- [x] 7.1 Replace inline SVGs with lucide-react icons in `projects/page.tsx`
- [x] 7.2 Replace inline SVGs with lucide-react icons in `projects/[id]/page.tsx`
- [x] 7.3 Replace inline SVGs with lucide-react icons in `projects/new/page.tsx`
- [x] 7.4 Verify: `grep -r "<svg" src/app/` returns no icon-only SVGs (code blocks/pre tags excluded)
