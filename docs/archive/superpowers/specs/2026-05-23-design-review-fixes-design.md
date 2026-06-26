# Design Review Fixes — Design Spec

**Date:** 2026-05-23
**Status:** Approved
**Score:** 4/10 → 7/10 (target after fixes)

## Context

Design review identified 7 categories of UI/UX issues across 8 pages. Navigation is fragmented (each page builds its own header), mobile users cannot access edit/delete actions, homepage shows AI-generated patterns, and duplicated constants increase maintenance cost.

## Approved Decisions

### D1: Global header in layout.tsx
Single shared `GlobalHeader` component. Brand logo + "Projects" + "AI Settings" + "New Project" CTA + mobile hamburger. Pages keep breadcrumb sub-navigation below. Existing `Header.tsx` and `Sidebar.tsx` deleted.

### D2: lucide-react as sole icon system
All inline SVGs replaced with lucide-react. Already a dependency. Consistent sizing, colors, tree-shaking.

### D3: Touch-friendly action buttons
`sm:opacity-0 sm:group-hover:opacity-100` pattern — always visible on mobile, hover-to-reveal on desktop.

### D4: Debounce via useDebounce hook
New `lib/hooks.ts` with 300ms debounce hook. No lodash dependency.

### D5: Constants extraction
New `lib/constants.ts` with METHODS, COMMON_STATUS_CODES, STATUS_CODES. Single source of truth.

### D6: Homepage feature cards redesign
lucide-react icons (Bot, Zap, Wrench) replace emoji. Asymmetric layout breaks 3-column grid pattern.

### D7: CTA priority swap
"My Projects" as primary CTA, "Quick Start" as secondary.

### D8: Delete action consolidation
Single delete entry per page. `ConfirmDialog` instead of native `confirm()`.

### D9: Skeleton loading states
All list pages use `Skeleton` component. No "Loading..." text.

## Non-Goals

- Full dark mode audit
- Endpoint detail page code splitting (1200+ lines)
- New DESIGN.md creation
- Database or API changes
- Share page redesign

## Files

**New:** `lib/constants.ts`, `lib/hooks.ts`, `components/layout/GlobalHeader.tsx`
**Modified:** All `page.tsx` files, `app/layout.tsx`
**Deleted:** `components/layout/Header.tsx`, `components/layout/Sidebar.tsx`

## Implementation Order

1. Constants & hooks (no dependencies)
2. Global navigation (depends on nothing)
3. Homepage redesign (depends on 1, 2)
4. Mobile accessibility (depends on 1)
5. Delete consolidation (standalone)
6. Loading states (standalone)
7. Icon unification (depends on 2 being done first)
