# Supabase production security evidence — 2026-07-18

Project: `gyeol-pilot` (`zayyhjsppoybprvwdddj`, Seoul)

This report records direct production database evidence without storing any
credential. It separates the verified database boundary from the still-pending
Vercel runtime secret recovery.

## Verified database boundary

- Project status was `ACTIVE_HEALTHY`.
- Migration `20260715153303 harden_aru_data_api_permissions` was present.
- All nine application tables existed: `purchases`, `checkins`,
  `care_intents`, `labels`, `consent_events`, `pilot_notes`, `crop_samples`,
  `reengage_contacts`, and `funnel_events`.
- RLS was enabled on every table.
- `anon` and `authenticated` had no SELECT, INSERT, UPDATE, or DELETE privilege
  on any of the nine tables.
- Direct SELECT attempts after `set local role anon` and
  `set local role authenticated` failed with PostgreSQL `42501`.
- `service_role` had SELECT, INSERT, UPDATE, and DELETE privilege on every
  table.
- A service-role transaction inserted marker
  `codex-service-role-dry-run`, observed it inside the transaction, and rolled
  back. A fresh query returned `rollback_residue_count = 0`.
- Storage bucket `gyeol-crop-samples` existed with `public = false`.
- All nine tables contained zero production rows during this verification.

Supabase security advisors reported only `RLS enabled no policy` informational
items. That is intentional for this server-only model: browser roles have no
table privileges and no allow policies. Performance advisors reported unused
indexes on empty pilot tables and the absolute Auth connection strategy; neither
changes the current launch boundary.

## Vercel runtime state

Vercel masks pulled sensitive values rather than returning plaintext secrets.
The mask was initially mistaken for an invalid stored value, and the production
`SUPABASE_SERVICE_ROLE_KEY` project variable was removed before that behavior
was confirmed. The currently serving deployment retains its immutable prior
environment snapshot and was not redeployed, so the public local-only product
remains unchanged.

Read-only production canary on 2026-07-18 showed `GET /api/sync` reporting all
three configuration flags as true. The old snapshot accepted
`https://kbeauty-ai-camera.vercel.app` as a sync origin but rejected the
canonical `https://aru-beauty.vercel.app` with 403. The corrected project
environment was completed after this snapshot: the project owner created a
modern key named `aru_vercel_production` and stored it as the Sensitive,
Production-only Vercel `SUPABASE_SERVICE_ROLE_KEY` without sharing the value.
The new environment is intentionally not treated as active until a new
deployment is verified.

The repository now rejects masked values and weak sync tokens instead of
reporting Supabase sync as configured. The 2026-07-18 local smoke passed 52 test
files and 252 tests, ESLint, the Next.js production build, TypeScript, ML Python
compile, and route probes.

Do not redeploy production until this recovery sequence is complete:

1. In Supabase Dashboard, open Project Settings → API Keys.
2. Create a modern secret key named `aru_vercel_production`.
3. Store it as Vercel production `SUPABASE_SERVICE_ROLE_KEY` with Sensitive
   enabled. Never paste it into Git, docs, shell history, or an issue.
4. Redeploy the existing `main` production deployment.
5. Confirm `GET /api/sync` reports `configured: true`,
   `cropBucketConfigured: true`, and `originGuardConfigured: true`.
6. Confirm an unauthenticated sync POST returns 401 and an authenticated empty
   `dryRun` returns 200 without database writes.
7. Run the production page/API/MediaPipe canary and inspect runtime errors
   before promoting any pilot upload.

## References

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Migrating to new API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
