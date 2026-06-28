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

-- The data flywheel: heuristic features + user-confirmed labels (no images).
create table if not exists labels (
  id bigint generated always as identity primary key,
  features jsonb not null,     -- { shine, relRedness, cov, tzoneL, cheekL }
  labels jsonb not null,       -- { oil, redness, pores } ordinals
  source text not null,        -- confirmed | corrected
  ts bigint not null,
  user_id uuid references auth.users (id) default auth.uid()
);

-- RLS: enable + own-rows-only (uncomment once auth is wired).
-- alter table purchases enable row level security;
-- alter table checkins  enable row level security;
-- alter table labels    enable row level security;
-- create policy "own rows" on purchases for all using (auth.uid() = user_id);
-- create policy "own rows" on checkins  for all using (auth.uid() = user_id);
-- create policy "own rows" on labels    for all using (auth.uid() = user_id);
