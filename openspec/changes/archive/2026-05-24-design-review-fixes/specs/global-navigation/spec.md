## ADDED Requirements

### Requirement: Global header component
The system SHALL render a shared `GlobalHeader` component in `app/layout.tsx` visible on all pages. The header SHALL contain: brand logo ("ApiMock" with blue "M" icon), navigation links ("Projects", "AI Settings"), and a "New Project" CTA button.

#### Scenario: Desktop navigation renders correctly
- **WHEN** user views any page on a viewport >= 640px wide
- **THEN** the global header shows brand logo, "Projects" link, "AI Settings" link, and "New Project" button in a single row

#### Scenario: Mobile navigation via hamburger menu
- **WHEN** user views any page on a viewport < 640px wide
- **THEN** the global header shows brand logo and hamburger icon; tapping hamburger reveals nav links and CTA vertically

#### Scenario: Current page highlighted
- **WHEN** user is on "/projects" page
- **THEN** the "Projects" nav link has a distinct active style (different color/underline)

### Requirement: Per-page header removal
All pages SHALL NOT render their own header navigation. Pages MAY render breadcrumb-style sub-navigation below the global header (e.g., "Projects > My Project").

#### Scenario: Project detail page breadcrumb
- **WHEN** user navigates to `/projects/abc123`
- **THEN** the global header renders at top, and below it a breadcrumb shows "Projects > My Project Name"

### Requirement: Unused layout components deleted
The system SHALL remove `components/layout/Header.tsx` and `components/layout/Sidebar.tsx` as they are not referenced by any page.

#### Scenario: No imports of deleted components
- **WHEN** the codebase is searched for imports of Header or Sidebar from components/layout
- **THEN** zero results are found

### Requirement: Homepage CTA priority
The homepage hero section SHALL show "My Projects" (linking to `/projects`) as the primary CTA button and "Quick Start" (linking to `/projects/new`) as the secondary CTA.

#### Scenario: Returning user sees projects link first
- **WHEN** user visits the homepage
- **THEN** the first/leftmost CTA button is "My Projects" with primary styling (blue background)
- **AND** the second CTA is "Quick Start" with secondary styling (border outline)

### Requirement: Homepage feature cards use lucide icons
The homepage feature cards SHALL use lucide-react icons (Bot, Zap, Wrench) instead of emoji characters. The 3-card layout SHALL use asymmetric sizing (first card spans wider than others).

#### Scenario: No emoji in feature cards
- **WHEN** user views the homepage features section
- **THEN** icons are rendered via lucide-react SVG components, not emoji text characters
- **AND** the first card is visually wider than the other two
