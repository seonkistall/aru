alter table public.reengage_contacts
  add column if not exists locale text not null default 'ko'
  check (locale in ('ko', 'en', 'ja', 'zh'));
