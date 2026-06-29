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

-- Create a private bucket for crops in Supabase Storage before enabling upload:
-- insert into storage.buckets (id, name, public)
-- values ('gyeol-crop-samples', 'gyeol-crop-samples', false)
-- on conflict (id) do nothing;
--
-- The app's /api/sync route uploads with SUPABASE_SERVICE_ROLE_KEY and a private
-- SUPABASE_SYNC_TOKEN. Do not expose service_role in client code.
-- Recommended env:
--   SUPABASE_URL
--   SUPABASE_SERVICE_ROLE_KEY
--   SUPABASE_SYNC_TOKEN
--   SUPABASE_CROP_BUCKET=gyeol-crop-samples
--   SUPABASE_CROP_RETENTION_DAYS=180
--   SUPABASE_SYNC_ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com

-- RLS: enable + own-rows-only (uncomment once auth is wired).
-- alter table purchases enable row level security;
-- alter table checkins  enable row level security;
-- alter table care_intents enable row level security;
-- alter table labels    enable row level security;
-- alter table consent_events enable row level security;
-- alter table pilot_notes enable row level security;
-- alter table crop_samples enable row level security;
-- create policy "own rows" on purchases for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- create policy "own rows" on checkins  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- create policy "own rows" on care_intents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- create policy "own rows" on labels    for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- create policy "own rows" on consent_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- create policy "own rows" on pilot_notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- create policy "own rows" on crop_samples for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- If your 2026 Supabase project has table auto-exposure disabled, grant only the
-- minimum roles you actually use after enabling RLS and policies above.
-- grant select, insert, update on purchases, checkins, care_intents to authenticated;
-- grant select, insert, update on labels, consent_events, pilot_notes, crop_samples to authenticated;
