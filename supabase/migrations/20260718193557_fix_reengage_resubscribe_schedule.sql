alter table public.reengage_contacts
  add column if not exists consent_version text,
  add column if not exists consented_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists retention_until timestamptz;

update public.reengage_contacts
set consented_at = created_at
where consented_at is null;

alter table public.reengage_contacts
  alter column consented_at set default now(),
  alter column consented_at set not null;
