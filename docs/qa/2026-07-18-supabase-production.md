# Supabase production security evidence — 2026-07-18

Project: `gyeol-pilot` (`zayyhjsppoybprvwdddj`, Seoul)

This report records direct production database evidence without storing any
credential. It separates the verified database boundary from runtime checks
that require an authenticated sync token.

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

## Vercel runtime recovery

Vercel masks pulled sensitive values rather than returning plaintext secrets.
The mask was initially mistaken for an invalid stored value, and the production
`SUPABASE_SERVICE_ROLE_KEY` project variable was removed before that behavior
was confirmed. The project owner then created the modern Supabase secret
`aru_vercel_production` and registered it as the Sensitive, Production-only
Vercel variable without sharing the value.

The corrected project environment is active in Production deployment
`dpl_TA7wP6c7mmtWrpvKNH2prn9NRP1o`. A fresh canonical-origin canary reported
`configured: true`, `cropBucketConfigured: true`, and
`originGuardConfigured: true`. An unauthenticated sync POST returned 401.

The repository rejects masked values and weak sync tokens instead of reporting
Supabase sync as configured. Modern `sb_secret_*` values are treated as opaque
credentials rather than being constrained by an undocumented suffix length.
The 2026-07-18 local smoke passed 52 test files and 254 tests, ESLint, the
Next.js production build, TypeScript, ML Python compile, and route probes.

The recovery sequence is complete through unauthenticated runtime verification:

1. Create the modern secret `aru_vercel_production`. **Complete.**
2. Store it as the Sensitive, Production-only Vercel
   `SUPABASE_SERVICE_ROLE_KEY`. **Complete.**
3. Redeploy `main` and confirm all three `/api/sync` configuration flags.
   **Complete.**
4. Confirm an unauthenticated canonical-origin sync POST returns 401.
   **Complete.**
5. Run the production page/API/MediaPipe canary and inspect runtime errors.
   **Complete; see `2026-07-18-post-deploy-canary.md`.**

The remaining promotion gate is an authenticated empty `dryRun` returning 200
without database writes, followed by authenticated private-bucket access. It was
not simulated with a guessed or recovered token. Pilot upload remains disabled
until an authorized operator performs that check.

## References

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Migrating to new API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
