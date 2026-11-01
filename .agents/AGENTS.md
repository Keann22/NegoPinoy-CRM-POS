# NegoPinoy CRM POS — Agent Rules

**Before designing any feature, read `docs/BUSINESS_WORKFLOW.md`** — how the team
actually buys, receives, and counts, and what must stay confidential.

## Code Quality Rules

### File Size Limit
- **Any source file over 400 lines (excluding blanks and comments) must be flagged** and split before or during the same working session.
- Run `npm run check:lines` to see the current offenders.
- When editing a file that is already over 400 lines, always note it in your response and propose a split plan.

### TypeScript
- The project must always compile cleanly: `npm run typecheck` (i.e. `tsc --noEmit`) must pass with zero errors before ending any session.
- Never use `// @ts-ignore` or `// @ts-expect-error` without leaving a comment explaining why.
- Never widen a type to `any` as a quick fix — use proper types or `unknown` with a type guard.

### Component Rules
- Components should do **one thing**. If a component has more than one distinct visual section and is over 200 lines, consider splitting.
- All Supabase data fetching should go through hooks in `src/hooks/`, not inline inside page components.
- All shared types must be defined in `src/types/`, not inline inside component files.

### Locked business formulas
- **Unallocated stock** (what is on the shelf, ready to pick) is fixed by the owner:
  `max(0, stock_level + unpicked)`, in `src/lib/services/inventory/shelf-stock-service.ts`.
  Do not change it or compute it anywhere else. See architecture.md, "Unallocated Stock =
  What Is on the Shelf (LOCKED)".

### Security (2026-11-01)
- **Staff roles come only from `app_metadata`**, via `src/lib/auth/staff-roles.ts`
  (`staffRolesOf`, `isStaffUser`). Never read roles from `user_metadata`: users can edit it.
  Roles are set only through `/api/admin/users` (owners/admins).
- `src/middleware.ts` makes every `/api/*` route and dashboard page staff-only. A route
  called from outside (cron, webhook) must check its own secret and be listed in `OPEN_PATHS`.
- **The public (anon) key has no database access** except categories, address lists and
  the product columns in `website/src/lib/publicProductColumns.ts`
  (`scripts/migrations/2026-11-01_lock_public_access.sql`). Browser code must use the
  session client from `@/lib/supabase/client`, never `createClient(url, ANON_KEY)`.
- New tables and functions are not public by default; grant to `authenticated` as needed.

### Architecture
- Read `ARCHITECTURE.md` before making structural changes to the codebase.
- Do not add new top-level directories to `src/` without updating `ARCHITECTURE.md`.
- Do not add new npm packages without considering if the existing stack can handle the requirement first.

## Working Style
- Always run `npm run typecheck` after significant changes.
- When fixing a bug, check if the same bug pattern exists elsewhere in the codebase.
- Prefer targeted fixes over rewriting large sections of working code.
