# Supabase sync runbook

This runbook turns local pilot data into a backend-backed research dataset.

## 1. Create the schema

Run `supabase/schema.sql` in the Supabase SQL editor.

Important 2026 Supabase behavior:

- New tables may not be exposed to the Data API automatically.
- Enable RLS before granting exposed roles.
- Grant only the roles and privileges this app actually needs.

## 2. Create a private crop bucket

Create a private Storage bucket:

```sql
insert into storage.buckets (id, name, public)
values ('gyeol-crop-samples', 'gyeol-crop-samples', false)
on conflict (id) do nothing;
```

Do not make crop objects public. Do not create public URLs for pilot crops.

## 3. Configure env

Set these on the server:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SYNC_TOKEN=
SUPABASE_CROP_BUCKET=gyeol-crop-samples
SUPABASE_CROP_RETENTION_DAYS=180
SUPABASE_SYNC_ALLOWED_ORIGINS=https://your-domain.com
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never prefix it with
`NEXT_PUBLIC_`.

Then verify the connection:

```bash
npm run supabase:check
```

The check confirms that the server-only Supabase key can reach every pilot table
and that the crop bucket exists and is private.

## 4. Dry-run from `/ops`

1. Open `/ops`.
2. Check the Supabase sync status pill.
3. Paste `SUPABASE_SYNC_TOKEN`.
4. Keep dry-run enabled.
5. Run sync and review warnings.

Expected early warnings:

- Fewer than 30 labels: threshold calibration only.
- Fewer than 30 crop samples: skip CNN training.
- No pilot notes: subgroup/device analysis will be weak.

## 5. Upload

Only disable dry-run after the warnings are understood.

The API uploads:

- `consent_events` by `id`
- `pilot_notes` by `id`
- `labels` by `client_id`
- Storage crop objects with `upsert: false`
- `crop_samples` metadata linked to consent event/version

Crop upload is blocked unless the latest `learning_crop` consent is granted.

## 6. Deletion and retention

For production, deletion must do all of the following:

- Remove or quarantine the Storage object.
- Set `crop_samples.deleted_at`.
- Set `exclude_reason` so future ML runs skip the sample.
- Keep an audit trail of the request and completion.
- Rebuild training manifests from non-deleted samples only.

Until this is fully wired, keep crop sync limited to controlled pilots.

## Official references checked

- [Supabase changelog](https://supabase.com/changelog.md)
- [Supabase Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase Storage standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
