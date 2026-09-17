import { getConsentEvents, type ConsentEvent } from "./consent";
import { getCropSamples, type CropSample } from "./crops";
import { getFunnelEvents, type FunnelEvent } from "./funnel";
import { getLabels, type LabeledSample } from "./labels";
import { getPilotNotes, type PilotNote } from "./pilot";

export type SyncLabel = LabeledSample & { id: string };

export const SYNC_SCHEMA_VERSIONS = ["2026-06-29.sync.v1", "2026-07-04.sync.v2"] as const;
export type SyncSchemaVersion = (typeof SYNC_SCHEMA_VERSIONS)[number];

/**
 * Who wrote a row. Every synced table carries one of these in `metadata.source`.
 *
 * It was the literal `"ops-local"` while `/ops` was the only writer in existence.
 * `POST /api/funnel` is the second, and the two must stay distinguishable in
 * `funnel_events`: one row is an operator deliberately uploading their own device's
 * log behind a typed token, the other is an unauthenticated write from the open
 * internet whose `visitor_id` nobody can vouch for. An analysis that pools them is
 * counting two different things.
 *
 * The marker is chosen by the route, never read from the request body — see
 * `app/api/funnel/route.ts` — so a caller cannot label its rows `ops-local`.
 */
export const SYNC_SOURCES = ["ops-local", "public-funnel"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export type GyeolSyncPayload = {
  schemaVersion: SyncSchemaVersion;
  clientGeneratedAt: number;
  source: SyncSource;
  labels: SyncLabel[];
  cropSamples: CropSample[];
  pilotNotes: PilotNote[];
  consentEvents: ConsentEvent[];
  funnelEvents?: FunnelEvent[]; // added in v2; optional so v1 readers still parse
};

export type SyncResult = {
  ok: boolean;
  dryRun?: boolean;
  configured?: boolean;
  counts: {
    labels: number;
    cropSamples: number;
    cropUploads: number;
    pilotNotes: number;
    consentEvents: number;
    funnelEvents: number;
  };
  warnings: string[];
  errors: string[];
};

export function buildLocalSyncPayload(): GyeolSyncPayload {
  const labels = getLabels().map((sample, index) => ({
    ...sample,
    id: sample.id ?? `legacy-label-${sample.ts}-${index}`,
  }));

  return {
    schemaVersion: "2026-07-04.sync.v2",
    clientGeneratedAt: Date.now(),
    source: "ops-local",
    labels,
    cropSamples: getCropSamples(),
    pilotNotes: getPilotNotes(),
    consentEvents: getConsentEvents(),
    funnelEvents: getFunnelEvents(),
  };
}

export function latestConsentGranted(
  payload: GyeolSyncPayload,
  kind: ConsentEvent["kind"],
  scope?: { participantId?: string; sessionId?: string }
) {
  const events = payload.consentEvents.filter((event) => {
    if (event.kind !== kind) return false;
    // Exact scope match, including undefined===undefined. Skipping the check
    // when the crop scope is undefined would let ANY scoped grant authorize an
    // unscoped crop (fail-open) — a consent-invariant violation.
    if ((event.participantId ?? undefined) !== (scope?.participantId ?? undefined)) return false;
    if ((event.sessionId ?? undefined) !== (scope?.sessionId ?? undefined)) return false;
    return true;
  });
  return events.length ? events[events.length - 1]?.granted === true : false;
}
