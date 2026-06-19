## Context

ApiMock is a Next.js 16 + React 19 app with 8 pages. Current state: each page implements its own header/navigation, uses inline SVGs alongside lucide-react icons, duplicates constants across files, and has mobile accessibility issues (hover-only buttons, no search debounce).

The project already has reusable UI components (Card, Button, Badge, Toast, ConfirmDialog, Skeleton) but inconsistent usage. Header.tsx and Sidebar.tsx exist but are unused.

## Goals / Non-Goals

**Goals:**
- Unified global navigation across all pages
- Mobile-first touch accessibility
- Eliminate AI-generated design patterns
- Reduce code duplication (constants, icons, mobile menu logic)
- Consistent loading/error state handling

**Non-Goals:**
- Full dark mode audit (keep existing support, don't fix edge cases)
- Endpoint detail page code splitting (1200+ lines, separate refactor)
- New DESIGN.md creation
- Database or API changes
- Share page redesign

## Decisions

### D1: Global header in layout.tsx

**Choice**: Add a shared `GlobalHeader` component to `app/layout.tsx`, remove per-page headers.
**Alternative considered**: Use existing `Header.tsx` — rejected because it has Sidebar toggle logic and nav items (Dashboard, Templates) that don't match current routes.
**Rationale**: Each page currently builds its own header with different nav items. A single shared header with brand logo + "Projects" + "AI Settings" + "New Project" CTA + mobile menu covers all needs. Pages keep breadcrumb-style navigation below the global header.

### D2: lucide-react as sole icon system

**Choice**: Replace all inline SVGs with lucide-react icons.
**Rationale**: lucide-react is already a dependency. Mixing inline SVGs and lucide creates two icon systems. lucide provides consistent sizing, colors, and tree-shaking.

### D3: Touch-friendly action buttons

**Choice**: Show action buttons always on mobile (no hover dependency). Use `sm:opacity-0 sm:group-hover:opacity-100` pattern — always visible on small screens, hover-to-reveal on desktop.
**Alternative considered**: Long-press to reveal — rejected, no native web support, poor discoverability.
**Rationale**: Hover doesn't exist on touch devices. Progressive enhancement: desktop gets hover, mobile gets always-visible.

### D4: Debounce via utility hook

**Choice**: Create `useDebounce` hook in `lib/hooks.ts` for search inputs.
**Alternative considered**: Use `lodash.debounce` — rejected, unnecessary dependency for simple timing.
**Rationale**: 300ms debounce prevents excessive API calls during typing. Simple hook, no library needed.

### D5: Constants extraction

**Choice**: Create `lib/constants.ts` with METHODS, COMMON_STATUS_CODES, STATUS_CODES.
**Rationale**: These are currently copy-pasted in 2-3 files. Single source of truth prevents drift.

### D6: Homepage feature cards redesign

**Choice**: Replace emoji with lucide icons (Bot, Zap, Wrench), use asymmetric layout (first card wider).
**Rationale**: Emoji icons are AI slop signal #7. Symmetric 3-column grid is AI slop signal #2. Breaking symmetry makes it feel intentional.

## Risks / Trade-offs

- **Risk**: Global header adds coupling between pages → Mitigation: header is purely presentational, no page-specific logic
- **Risk**: Removing per-page headers changes visual identity of each page → Mitigation: breadcrumb navigation preserved below global header
- **Trade-off**: Always-visible mobile buttons reduce card cleanliness → accepted, functionality > aesthetics on mobile
