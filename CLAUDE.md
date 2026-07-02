# Claude Agent Instructions

This file is linked to the comprehensive [AGENTS.md](AGENTS.md) which contains all project conventions, architecture, and pitfalls for AI coding agents.

## Quick Start for Claude

1. **First Task?** Read [AGENTS.md](AGENTS.md) for project overview
2. **Editing Code?** Always check the data flow section and feature conventions
3. **Adding API Route?** Review [app/api/sync/route.ts](app/api/sync/route.ts) for pattern (rate limiting, token validation)
4. **Touching ML?** Respect participant grouping in cross-validation (see "ML Readiness Bands" in AGENTS.md)
5. **Stuck?** Check "When You Get Stuck" section in AGENTS.md

## Claude-Specific Notes

- **Surgical changes only**: This codebase has tight integration between frontend, backend, and ML. Don't refactor for the sake of it; changes must trace directly to a request.
- **Privacy-first**: Two consent streams are intentionally separate. Don't merge them or change the audit model without explicit request.
- **Research vs Production**: Some features (pilot session, /ops dashboard, ML pipeline) are research-mode only. Clearly separate in your edits.
- **Efficacy filtering is non-negotiable**: All LLM outputs for product reasons must pass the `efficacyClean()` check. This is a compliance requirement, not optional.

## Key Files for Common Tasks

| Task | Files |
|------|-------|
| **Camera feature extraction** | [lib/skin.ts](lib/skin.ts), [app/scan/page.tsx](app/scan/page.tsx) |
| **Recommendation algorithm** | [lib/recommend.ts](lib/recommend.ts), [app/report/page.tsx](app/report/page.tsx) |
| **Data sync to Supabase** | [app/api/sync/route.ts](app/api/sync/route.ts), [lib/supabase-admin.ts](lib/supabase-admin.ts) |
| **ML readiness tracking** | [app/ops/page.tsx](app/ops/page.tsx), [lib/ml-readiness.ts](lib/ml-readiness.ts) |
| **Participant management** | [lib/pilot.ts](lib/pilot.ts), [app/pilot/page.tsx](app/pilot/page.tsx) |
| **Consent audit trail** | [lib/consent.ts](lib/consent.ts), [app/privacy/page.tsx](app/privacy/page.tsx) |

---

See [AGENTS.md](AGENTS.md) for full architecture, tech stack, conventions, and pitfalls.
