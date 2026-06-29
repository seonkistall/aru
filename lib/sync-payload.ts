import { getConsentEvents, type ConsentEvent } from "./consent";
import { getCropSamples, type CropSample } from "./crops";
import { getLabels, type LabeledSample } from "./labels";
import { getPilotNotes, type PilotNote } from "./pilot";

export type SyncLabel = LabeledSample & { id: string };

export type GyeolSyncPayload = {
  schemaVersion: "2026-06-29.sync.v1";
  clientGeneratedAt: number;
  source: "ops-local";
  labels: SyncLabel[];
  cropSamples: CropSample[];
  pilotNotes: PilotNote[];
  consentEvents: ConsentEvent[];
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
    schemaVersion: "2026-06-29.sync.v1",
    clientGeneratedAt: Date.now(),
    source: "ops-local",
    labels,
    cropSamples: getCropSamples(),
    pilotNotes: getPilotNotes(),
    consentEvents: getConsentEvents(),
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
