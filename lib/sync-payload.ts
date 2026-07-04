import { getConsentEvents, type ConsentEvent } from "./consent";
import { getCropSamples, type CropSample } from "./crops";
import { getFunnelEvents, type FunnelEvent } from "./funnel";
import { getLabels, type LabeledSample } from "./labels";
import { getPilotNotes, type PilotNote } from "./pilot";

export type SyncLabel = LabeledSample & { id: string };

export const SYNC_SCHEMA_VERSIONS = ["2026-06-29.sync.v1", "2026-07-04.sync.v2"] as const;
export type SyncSchemaVersion = (typeof SYNC_SCHEMA_VERSIONS)[number];

export type GyeolSyncPayload = {
  schemaVersion: SyncSchemaVersion;
  clientGeneratedAt: number;
  source: "ops-local";
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
    if (scope?.participantId && event.participantId !== scope.participantId) return false;
    if (scope?.sessionId && event.sessionId !== scope.sessionId) return false;
    return true;
  });
  return events.length ? events[events.length - 1]?.granted === true : false;
}
