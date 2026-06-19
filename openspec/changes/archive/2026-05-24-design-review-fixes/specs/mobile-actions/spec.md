## ADDED Requirements

### Requirement: Touch-accessible action buttons
Action buttons (edit, delete) on card-based list items SHALL be visible on touch devices without requiring hover. On desktop (>= 640px), they MAY use hover-to-reveal. On mobile (< 640px), they SHALL be always visible.

#### Scenario: Mobile user sees action buttons
- **WHEN** user views the project list on a viewport < 640px wide
- **THEN** edit and delete buttons on each project card are visible without any interaction

#### Scenario: Desktop user sees hover reveal
- **WHEN** user views the project list on a viewport >= 640px wide
- **THEN** edit and delete buttons appear when hovering over a project card

### Requirement: Search input debounce
Search inputs that trigger API calls SHALL debounce input by 300ms. Only after the user stops typing for 300ms SHALL the search query be applied.

#### Scenario: Rapid typing triggers single API call
- **WHEN** user types "users" in the endpoint search box by pressing each key within 100ms
- **THEN** only one API call is made (after 300ms of inactivity), not five

### Requirement: Icon buttons have aria-labels
All `<button>` elements that contain only an icon (no visible text) SHALL have an `aria-label` attribute describing the action.

#### Scenario: Screen reader announces delete button
- **WHEN** a screen reader encounters a delete button that contains only a trash icon
- **THEN** it announces the aria-label value (e.g., "Delete project")

### Requirement: Delete action uses ConfirmDialog
All delete operations SHALL use the existing `ConfirmDialog` component instead of native `confirm()`. There SHALL be only one delete entry point per entity per page.

#### Scenario: Project detail page has single delete button
- **WHEN** user views a project with zero endpoints
- **THEN** the delete button appears only in the project info card, not in the empty endpoint state area

#### Scenario: Delete triggers ConfirmDialog
- **WHEN** user clicks any delete button in the application
- **THEN** a ConfirmDialog modal appears with title, description, and confirm/cancel buttons (not a browser native dialog)

### Requirement: Skeleton loading states
All list pages (projects, endpoints, requests, AI providers) SHALL use the `Skeleton` component for loading states instead of plain text like "Loading...".

#### Scenario: Projects page loading state
- **WHEN** the projects list is loading
- **THEN** skeleton placeholders matching the card layout are displayed, not a "Loading..." text string
