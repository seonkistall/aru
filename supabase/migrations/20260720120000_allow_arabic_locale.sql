-- Arabic (ar) joins the shipped locales; widen the reengage locale check.
alter table public.reengage_contacts
  drop constraint if exists reengage_contacts_locale_check;
alter table public.reengage_contacts
  add constraint reengage_contacts_locale_check
  check (locale in ('ko', 'en', 'ja', 'zh', 'ar'));
