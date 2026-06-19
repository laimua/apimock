## Why

Design review scored all pages 4/10. Navigation is fragmented (each page builds its own header), mobile users cannot access edit/delete actions (hover-only buttons), the homepage shows obvious AI-generated patterns (emoji icons, 3-column feature grid), and duplicated constants/icons increase maintenance cost.

## What Changes

- Unify navigation: single global header in `layout.tsx`, remove per-page header implementations
- Fix mobile accessibility: make action buttons always visible on touch devices, add search debounce, add aria-labels
- Remove AI slop from homepage: replace emoji icons with lucide-react, break 3-column symmetry
- Extract shared constants (`METHODS`, `COMMON_STATUS_CODES`) to `lib/constants.ts`, unify icon system to lucide-react
- Consolidate delete action: single entry point using `ConfirmDialog`, remove duplicate delete buttons
- Standardize loading states: skeleton screens on all list pages
- Adjust homepage CTA priority: "My Projects" as primary, "Quick Start" as secondary

## Capabilities

### New Capabilities
- `global-navigation`: Shared header component with brand logo, nav links (Projects, AI Settings), current page highlight, mobile hamburger menu
- `shared-constants`: Centralized constants file for METHODS, STATUS_CODES, and other duplicated values
- `mobile-actions`: Touch-friendly action buttons (always visible, no hover dependency), debounce on search inputs

### Modified Capabilities

## Impact

- **Pages modified**: `app/page.tsx`, `app/projects/page.tsx`, `app/projects/[id]/page.tsx`, `app/projects/new/page.tsx`, `app/projects/[id]/endpoints/new/page.tsx`, `app/projects/[id]/endpoints/[endpointId]/page.tsx`, `app/settings/ai/page.tsx`
- **Layout modified**: `app/layout.tsx` (add global header)
- **New files**: `lib/constants.ts`
- **Deleted files**: `components/layout/Header.tsx`, `components/layout/Sidebar.tsx` (unused)
- **Dependencies**: lucide-react (already installed)
- **No API changes**: all changes are frontend-only
