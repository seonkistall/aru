import { auditCommerceOverrides } from "@/lib/commerce";
import { SKUS } from "@/lib/skus";
import { getSupabaseAdmin, hasValidSyncToken, isSupabaseSyncConfigured } from "@/lib/supabase-admin";
import { createRateLimiter, readBoundedJson, requestClientKey, RequestGuardError } from "@/lib/server/request-guard";
import { latestConsentGranted, SYNC_SCHEMA_VERSIONS, type GyeolSyncPayload, type SyncResult } from "@/lib/sync-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SYNC_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const syncLimit = createRateLimiter({ max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS, maxKeys: 10_000 });

type SyncRequest = {
  dryRun?: boolean;
  payload?: GyeolSyncPayload;
};

/**
 * What `COMMERCE_LINK_OVERRIDES_JSON` actually resolved to, rejections included.
 *
 * `auditCommerceOverrides` had no production caller, so a rejected affiliate override
 * was visible only in the request log. It is reported here because this is the status
 * handler /ops already fetches, and COMMERCE_LINK_OVERRIDES_JSON is server-side env
 * the client cannot read for itself.
 *
 * Behind the sync token, and that is not incidental. The rest of this response is
 * booleans about whether env is set; this is the only field that echoes env string
 * content, and an `unknown-sku` or `unknown-merchant` row is by construction a key that
 * is NOT in the catalogue — a sku staged ahead of a launch, a partner not yet
 * announced. GET is otherwise unauthenticated (no origin guard, no rate limit — both
 * are POST-only) and /api/sync is not in the proxy.ts matcher that 404s /ops, so
 * without the token this would be world-readable while the screen that renders it is
 * not. `value` is never included even so: /ops does not need the URL, and the server
 * log already carries it.
 */
function commerceOverrideStatus() {
  const audit = auditCommerceOverrides(undefined, { knownSkus: SKUS.map((sku) => sku.id) });
  return {
    configured: audit.configured,
    parsed: audit.parsed,
    accepted: audit.accepted.length,
    issues: audit.issues.map(({ sku, merchant, reason }) => ({ sku, merchant, reason })),
  };
}

export async function GET(request: Request) {
  return Response.json({
    configured: isSupabaseSyncConfigured(),
    cropBucketConfigured: Boolean(process.env.SUPABASE_CROP_BUCKET),
    originGuardConfigured: Boolean(process.env.SUPABASE_SYNC_ALLOWED_ORIGINS),
    maxBytes: MAX_SYNC_BYTES,
    rateLimit: {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
    },
    ...(hasValidSyncToken(request) ? { commerceOverrides: commerceOverrideStatus() } : {}),
  });
}

export async function POST(request: Request) {
  const guard = preflightGuard(request);
  if (guard) return guard;

  if (!hasValidSyncToken(request)) {
    return Response.json(result(false, ["Missing or invalid sync token."]), { status: 401 });
  }

  // Rate-limit only after auth so unauthenticated requests with spoofed
  // forwarding headers cannot consume limiter buckets.
  if (!syncLimit(requestClientKey(request))) {
    return Response.json(result(false, ["Too many sync attempts. Try again in a minute."]), { status: 429 });
  }

  let body: SyncRequest;
  try {
    const parsed = await readBoundedJson(request, MAX_SYNC_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(result(false, ["Invalid JSON body."]), { status: 400 });
    }
    body = parsed as SyncRequest;
  } catch (error) {
    const status = error instanceof RequestGuardError ? error.status : 400;
    const message = status === 413 ? `Sync payload is too large. Limit is ${MAX_SYNC_BYTES} bytes.` : "Invalid JSON body.";
    return Response.json(result(false, [message]), { status });
  }

  const payload = body.payload;
  if (
    !payload ||
    !SYNC_SCHEMA_VERSIONS.includes(payload.schemaVersion) ||
    !Array.isArray(payload.labels) ||
    !Array.isArray(payload.cropSamples) ||
    !Array.isArray(payload.pilotNotes) ||
    !Array.isArray(payload.consentEvents) ||
    // Optional since v2, and therefore the one array in the payload that was never
    // type-checked. `funnelEvents ?? []` accepts any truthy value, and a string gets
    // as far as `.length` before `.map` throws — an uncaught TypeError, i.e. a 500
    // where every other malformed array is a 400.
    (payload.funnelEvents !== undefined && !Array.isArray(payload.funnelEvents))
  ) {
    return Response.json(result(false, ["Unsupported or missing sync payload."]), { status: 400 });
  }

  if (!isSupabaseSyncConfigured()) {
    return Response.json({
      ...result(false, ["Supabase sync env is not configured."]),
      configured: false,
    } satisfies SyncResult, { status: 503 });
  }

  const dryRun = body.dryRun === true;
  const funnelEvents = payload.funnelEvents ?? [];
  const warnings = validatePayload(payload);
  const counts = {
    labels: payload.labels.length,
    cropSamples: payload.cropSamples.length,
    cropUploads: 0,
    pilotNotes: payload.pilotNotes.length,
    consentEvents: payload.consentEvents.length,
    funnelEvents: funnelEvents.length,
  };

  if (dryRun) {
    return Response.json({ ok: true, dryRun: true, configured: true, counts, warnings, errors: [] } satisfies SyncResult);
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return Response.json({
      ...result(false, ["Supabase admin client could not be created."]),
      configured: false,
    } satisfies SyncResult, { status: 503 });
  }

  const errors: string[] = [];

  if (payload.consentEvents.length) {
    const { error } = await supabase.from("consent_events").upsert(
      payload.consentEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        granted: event.granted,
        version: event.version,
        consent_text: event.text,
        participant_id: event.participantId ?? null,
        session_id: event.sessionId ?? null,
        metadata: { source: "ops-local" },
        ts: event.ts,
      })),
      { onConflict: "id" }
    );
    if (error) errors.push(`consent_events: ${error.message}`);
  }

  if (funnelEvents.length) {
    const { error } = await supabase.from("funnel_events").upsert(
      funnelEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        visitor_id: event.visitorId,
        session_id: event.sessionId,
        props: event.props ?? null,
        metadata: { source: "ops-local" },
        ts: event.ts,
      })),
      { onConflict: "id" }
    );
    if (error) errors.push(`funnel_events: ${error.message}`);
  }

  if (payload.pilotNotes.length) {
    const { error } = await supabase.from("pilot_notes").upsert(
      payload.pilotNotes.map((note) => ({
        id: note.id,
        participant: note.participant,
        participant_id: note.participantId ?? note.participant,
        session_id: note.sessionId ?? null,
        round: note.round ?? null,
        device_id: note.deviceId ?? null,
        reviewer_id: note.reviewerId ?? null,
        status: note.status ?? null,
        browser: note.browser,
        lighting: note.lighting,
        makeup: note.makeup,
        glasses: note.glasses,
        hair_cover: note.hairCover,
        scan_completed: note.scanCompleted,
        label_complete: note.labelComplete ?? false,
        second_review_needed: note.secondReviewNeeded ?? false,
        excluded_reason: note.excludedReason ?? null,
        consent_ai: note.consentAi,
        consent_crop: note.consentCrop,
        notes: note.notes,
        metadata: { source: "ops-local" },
        ts: note.ts,
      })),
      { onConflict: "id" }
    );
    if (error) errors.push(`pilot_notes: ${error.message}`);
  }

  if (payload.labels.length) {
    const { error } = await supabase.from("labels").upsert(
      payload.labels.map((sample) => ({
        client_id: sample.id,
        features: sample.features,
        labels: sample.labels,
        source: sample.source,
        participant_id: sample.meta?.participantId ?? null,
        session_id: sample.meta?.sessionId ?? null,
        capture_mode: sample.meta?.captureMode ?? null,
        quality: sample.meta?.quality ?? null,
        metadata: sample.meta ?? null,
        ts: sample.ts,
      })),
      { onConflict: "client_id" }
    );
    if (error) errors.push(`labels: ${error.message}`);
  }

  const bucket = process.env.SUPABASE_CROP_BUCKET;
  if (payload.cropSamples.length && !bucket) {
    warnings.push("Crop samples were not uploaded because SUPABASE_CROP_BUCKET is not configured.");
  } else if (payload.cropSamples.length && bucket) {
    const uploaded = await uploadCropSamples(supabase, bucket, payload);
    counts.cropUploads = uploaded.count;
    warnings.push(...uploaded.warnings);
    errors.push(...uploaded.errors);
  }

  return Response.json({
    ok: errors.length === 0,
    dryRun: false,
    configured: true,
    counts,
    warnings,
    errors,
  } satisfies SyncResult, { status: errors.length ? 207 : 200 });
}

function validatePayload(payload: GyeolSyncPayload) {
  const warnings: string[] = [];
  if (payload.labels.length < 30) warnings.push("Fewer than 30 labels: use threshold calibration only.");
  if (payload.cropSamples.length < 30) warnings.push("Fewer than 30 crop samples: skip CNN training.");
  const missingConsent = payload.cropSamples.filter((sample) => !hasCropConsent(payload, sample)).length;
  if (missingConsent) {
    warnings.push(`${missingConsent} crop samples do not have matching learning_crop consent and will be skipped.`);
  }
  if (!payload.pilotNotes.length) warnings.push("No pilot notes included; subgroup/device analysis will be weak.");
  return warnings;
}

function preflightGuard(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_SYNC_BYTES) {
    return Response.json(result(false, [`Sync payload is too large. Limit is ${MAX_SYNC_BYTES} bytes.`]), { status: 413 });
  }

  if (!originAllowed(request)) {
    return Response.json(result(false, ["Origin is not allowed for sync."]), { status: 403 });
  }

  return null;
}

function originAllowed(request: Request) {
  const allowList = (process.env.SUPABASE_SYNC_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!allowList.length) return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && allowList.includes(origin));
}

async function uploadCropSamples(supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>, bucket: string, payload: GyeolSyncPayload) {
  const warnings: string[] = [];
  const errors: string[] = [];
  let count = 0;

  if (!supabase) return { count, warnings, errors: ["Supabase admin client unavailable."] };

  for (const sample of payload.cropSamples) {
    if (!hasCropConsent(payload, sample)) {
      warnings.push(`Skipping crop ${sample.id}: no matching learning_crop consent.`);
      continue;
    }

    const parsed = parseImageDataUrl(sample.image);
    if (!parsed) {
      warnings.push(`Skipping crop ${sample.id}: unsupported image data URL.`);
      continue;
    }

    const objectPath = `pilot-crops/${new Date(sample.ts).toISOString().slice(0, 10)}/${sample.id}.${parsed.ext}`;
    const consentEvent = latestConsentEvent(payload, "learning_crop", sample);
    const upload = await supabase.storage.from(bucket).upload(objectPath, parsed.buffer, {
      contentType: parsed.contentType,
      upsert: false,
    });

    if (upload.error && !upload.error.message.includes("already exists")) {
      errors.push(`storage:${sample.id}: ${upload.error.message}`);
      continue;
    }

    const { error } = await supabase.from("crop_samples").upsert(
      {
        id: sample.id,
        object_path: objectPath,
        bucket,
        features: sample.features,
        labels: sample.labels,
        source: sample.source,
        participant_id: sample.meta?.participantId ?? null,
        session_id: sample.meta?.sessionId ?? null,
        capture_mode: sample.meta?.captureMode ?? null,
        quality: sample.meta?.quality ?? null,
        metadata: sample.meta ?? null,
        consent_event_id: consentEvent?.id ?? null,
        consent_version: consentEvent?.version ?? null,
        retention_until: retentionUntil(sample.ts),
        deleted_at: null,
        exclude_reason: null,
        ts: sample.ts,
      },
      { onConflict: "id" }
    );
    if (error) {
      errors.push(`crop_samples:${sample.id}: ${error.message}`);
      continue;
    }
    count++;
  }

  return { count, warnings, errors };
}

function latestConsentEvent(payload: GyeolSyncPayload, kind: "ai_analysis" | "learning_crop", sample?: GyeolSyncPayload["cropSamples"][number]) {
  const events = payload.consentEvents.filter((event) => {
    if (event.kind !== kind) return false;
    // Exact scope match (undefined===undefined) — see latestConsentGranted.
    if ((event.participantId ?? undefined) !== (sample?.meta?.participantId ?? undefined)) return false;
    if ((event.sessionId ?? undefined) !== (sample?.meta?.sessionId ?? undefined)) return false;
    return true;
  });
  return events.length ? events[events.length - 1] : null;
}

function hasCropConsent(payload: GyeolSyncPayload, sample: GyeolSyncPayload["cropSamples"][number]) {
  const scope = {
    participantId: sample.meta?.participantId,
    sessionId: sample.meta?.sessionId,
  };
  return latestConsentGranted(payload, "learning_crop", scope);
}

function retentionUntil(ts: number) {
  const base = Number.isFinite(ts) ? ts : Date.now();
  const days = Number(process.env.SUPABASE_CROP_RETENTION_DAYS || "180");
  return base + Math.max(1, days) * 24 * 60 * 60 * 1000;
}

function parseImageDataUrl(value: string) {
  const match = /^data:(image\/jpeg|image\/png);base64,(.+)$/.exec(value);
  if (!match) return null;
  const contentType = match[1];
  return {
    contentType,
    ext: contentType === "image/png" ? "png" : "jpg",
    buffer: Buffer.from(match[2], "base64"),
  };
}

function result(ok: boolean, errors: string[]): SyncResult {
  return {
    ok,
    configured: undefined,
    counts: { labels: 0, cropSamples: 0, cropUploads: 0, pilotNotes: 0, consentEvents: 0, funnelEvents: 0 },
    warnings: [],
    errors,
  };
}
