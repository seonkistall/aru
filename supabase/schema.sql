-- ④ Supabase schema for 결 (gyeol). Run in the Supabase SQL editor.
-- Privacy: NO selfies stored (D3). Only derived features/labels + purchases/checkins.

create table if not exists purchases (
  id text primary key,
  sku_id text not null,
  name text not null,
  price int not null,
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

create table if not exists checkins (
  id text primary key,
  sku_id text not null,
  week int not null,
  satisfaction int not null,   -- 1..3
  trouble boolean not null,
  repurchase boolean not null,
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

create table if not exists care_intents (
  id text primary key,
  kind text not null,          -- purchase | clinic | tourist
  label text not null,
  href text not null,
  locale text not null,        -- ko | en
  context text,
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

-- The data flywheel: heuristic features + user-confirmed labels (no images).
create table if not exists labels (
  id bigint generated always as identity primary key,
  client_id text unique,
  features jsonb not null,     -- { shine, relRedness, cov, tzoneL, cheekL }
  labels jsonb not null,       -- { oil, redness, pores } ordinals
  source text not null,        -- confirmed | corrected
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

-- Consent audit log: no image data, only the choice, policy text version, and time.
create table if not exists consent_events (
  id text primary key,
  kind text not null,          -- ai_analysis | learning_crop
  granted boolean not null,
  version text not null,
  consent_text text not null,
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

-- Pilot QA metadata for real-device camera tuning. No images.
create table if not exists pilot_notes (
  id text primary key,
  participant text not null,
  browser text not null,       -- ios-safari | android-chrome | desktop | other
  lighting text not null,      -- window | ceiling | dim | backlight | direct
  makeup text not null,        -- none | light | heavy
  glasses boolean not null,
  hair_cover boolean not null,
  scan_completed boolean not null,
  consent_ai boolean not null,
  consent_crop boolean not null,
  notes text,
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

-- Privacy-clean funnel analytics. Anonymous visitor/session ids only (random,
-- not derived from any user attribute); no images, no free text. Used to track
-- scan and survey journey diagnostics. Synced via /api/sync.
create table if not exists funnel_events (
  id text primary key,
  kind text not null,          -- share_landed | scan_started | scan_completed | survey_viewed | survey_completed | reco_viewed | share_clicked | commerce_clicked
  visitor_id text not null,
  session_id text not null,
  props jsonb,
  metadata jsonb,
  ts bigint not null
);
create index if not exists funnel_events_kind_ts_idx on funnel_events (kind, ts);

-- Opt-in ML crop metadata. The image bytes should live in a private Storage bucket.
create table if not exists crop_samples (
  id text primary key,
  bucket text not null,
  object_path text not null,
  features jsonb not null,
  labels jsonb not null,
  source text not null,        -- confirmed | corrected
  consent_event_id text references consent_events (id),
  consent_version text,
  retention_until bigint,
  deleted_at bigint,
  exclude_reason text,
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

create index if not exists purchases_user_id_idx on purchases (user_id);
create index if not exists checkins_user_id_idx on checkins (user_id);
create index if not exists care_intents_user_id_idx on care_intents (user_id);
create index if not exists labels_user_id_idx on labels (user_id);
create index if not exists consent_events_user_id_idx on consent_events (user_id);
create index if not exists pilot_notes_user_id_idx on pilot_notes (user_id);
create index if not exists crop_samples_consent_event_id_idx on crop_samples (consent_event_id);
create index if not exists crop_samples_user_id_idx on crop_samples (user_id);

-- Pilot v2 traceability fields. These are safe to rerun on existing projects.
alter table labels add column if not exists participant_id text;
alter table labels add column if not exists session_id text;
alter table labels add column if not exists capture_mode text;
alter table labels add column if not exists quality jsonb;
alter table labels add column if not exists metadata jsonb;

alter table consent_events add column if not exists participant_id text;
alter table consent_events add column if not exists session_id text;
alter table consent_events add column if not exists metadata jsonb;

alter table pilot_notes add column if not exists participant_id text;
alter table pilot_notes add column if not exists session_id text;
alter table pilot_notes add column if not exists round text;
alter table pilot_notes add column if not exists device_id text;
alter table pilot_notes add column if not exists reviewer_id text;
alter table pilot_notes add column if not exists status text;
alter table pilot_notes add column if not exists label_complete boolean default false;
alter table pilot_notes add column if not exists second_review_needed boolean default false;
alter table pilot_notes add column if not exists excluded_reason text;
alter table pilot_notes add column if not exists metadata jsonb;

alter table crop_samples add column if not exists participant_id text;
alter table crop_samples add column if not exists session_id text;
alter table crop_samples add column if not exists capture_mode text;
alter table crop_samples add column if not exists quality jsonb;
alter table crop_samples add column if not exists metadata jsonb;

-- recordCareIntent (lib/store.ts) inserts these commerce fields for purchase
-- clicks; without them PostgREST rejects the insert (PGRST204) and the server
-- copy of every product-purchase intent is silently lost (the BD/commerce
-- signal). Clinic clicks leave them undefined so they inserted regardless.
alter table care_intents add column if not exists sku_id text;
alter table care_intents add column if not exists merchant text;
alter table care_intents add column if not exists placement text;
alter table care_intents add column if not exists partner_ready boolean;
alter table care_intents add column if not exists region text;

-- The research crop bucket is always private. Re-running the schema also fixes
-- an accidentally public existing bucket.
insert into storage.buckets (id, name, public)
values ('gyeol-crop-samples', 'gyeol-crop-samples', false)
on conflict (id) do update set public = false;

-- The app's /api/sync route uploads with SUPABASE_SERVICE_ROLE_KEY and a private
-- SUPABASE_SYNC_TOKEN. Do not expose service_role in client code.
-- Recommended env:
--   SUPABASE_URL
--   SUPABASE_SERVICE_ROLE_KEY
--   SUPABASE_SYNC_TOKEN
--   SUPABASE_CROP_BUCKET=gyeol-crop-samples
--   SUPABASE_CROP_RETENTION_DAYS=180
--   SUPABASE_SYNC_ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com

-- Re-engagement opt-in contacts (email reminder for the 2/4-week routine
-- check-in). Written server-side via the service role by /api/reengage/subscribe
-- with explicit user consent; read by the scheduled /api/reengage/run.
create table if not exists reengage_contacts (
  email text primary key,
  context text,
  locale text not null default 'ko' check (locale in ('ko', 'en', 'ja', 'zh', 'ar')),
  consent boolean not null default true,
  created_at timestamptz not null default now(),
  week2_sent_at timestamptz,
  week4_sent_at timestamptz
);
alter table reengage_contacts add column if not exists consent_version text;
alter table reengage_contacts add column if not exists consented_at timestamptz;
alter table reengage_contacts add column if not exists revoked_at timestamptz;
alter table reengage_contacts add column if not exists retention_until timestamptz;
alter table reengage_contacts add column if not exists locale text not null default 'ko' check (locale in ('ko', 'en', 'ja', 'zh', 'ar'));
update reengage_contacts
set consented_at = created_at
where consented_at is null;
alter table reengage_contacts alter column consented_at set default now();
alter table reengage_contacts alter column consented_at set not null;

-- Anonymous ARU use is local-first. Browser roles get no table access; the
-- server-only service role used by sync and re-engagement bypasses RLS.
alter table purchases enable row level security;
alter table checkins enable row level security;
alter table care_intents enable row level security;
alter table labels enable row level security;
alter table consent_events enable row level security;
alter table pilot_notes enable row level security;
alter table funnel_events enable row level security;
alter table crop_samples enable row level security;
alter table reengage_contacts enable row level security;

revoke all on table purchases from anon, authenticated;
revoke all on table checkins from anon, authenticated;
revoke all on table care_intents from anon, authenticated;
revoke all on table labels from anon, authenticated;
revoke all on table consent_events from anon, authenticated;
revoke all on table pilot_notes from anon, authenticated;
revoke all on table funnel_events from anon, authenticated;
revoke all on table crop_samples from anon, authenticated;
revoke all on table reengage_contacts from anon, authenticated;

-- Storage is server-only through the platform-managed Storage RLS boundary.
-- Keeping this private bucket policy-free denies anon/authenticated access.

-- Reproduce the service-role path explicitly instead of relying on dashboard
-- defaults. The service role still bypasses RLS, but also needs SQL privileges.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Future objects stay private until their access is granted explicitly.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
