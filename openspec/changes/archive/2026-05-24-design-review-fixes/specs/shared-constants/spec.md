## ADDED Requirements

### Requirement: Centralized constants file
The system SHALL provide a `lib/constants.ts` file exporting `METHODS`, `COMMON_STATUS_CODES`, and `STATUS_CODES`.

#### Scenario: METHODS constant
- **WHEN** any file imports METHODS from lib/constants
- **THEN** it receives the array `['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']`

#### Scenario: COMMON_STATUS_CODES constant
- **WHEN** any file imports COMMON_STATUS_CODES from lib/constants
- **THEN** it receives an array of objects with `{ value: number, label: string, description: string }` for codes 200, 201, 204, 400, 401, 403, 404, 500

### Requirement: No duplicate constant definitions
The constants `METHODS` and `COMMON_STATUS_CODES` SHALL be defined exactly once in the codebase (in `lib/constants.ts`). All other files SHALL import from this single source.

#### Scenario: grep for duplicate METHODS
- **WHEN** searching the codebase for `const METHODS`
- **THEN** exactly one result is found in `lib/constants.ts`

### Requirement: Unified icon system
All icons in the application SHALL use lucide-react components. Inline SVG `<svg>` elements used as icons SHALL be replaced with equivalent lucide-react imports.

#### Scenario: No inline SVG icons in page components
- **WHEN** searching page files (src/app/**/page.tsx) for `<svg` tags used as standalone icons
- **THEN** zero results are found (SVGs are only acceptable in rare cases where lucide has no equivalent)
