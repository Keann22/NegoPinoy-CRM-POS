# NegoPinoy CRM POS — Agent Rules

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

### Architecture
- Read `ARCHITECTURE.md` before making structural changes to the codebase.
- Do not add new top-level directories to `src/` without updating `ARCHITECTURE.md`.
- Do not add new npm packages without considering if the existing stack can handle the requirement first.

## Working Style
- Always run `npm run typecheck` after significant changes.
- When fixing a bug, check if the same bug pattern exists elsewhere in the codebase.
- Prefer targeted fixes over rewriting large sections of working code.
