# NegoPinoy CRM POS

Before designing or building anything, base it on how the business actually
works. The workflow is below; keep it up to date when the owner explains more.

@docs/BUSINESS_WORKFLOW.md

## Working rules

- Code rules for all agents live in `.agents/AGENTS.md`.
- Vercel deploys from `main`; commit and push to `main`, no pull requests.
- The database is the live production Supabase project.
- Times in the database are UTC; show and report them in Philippine time (UTC+8).
