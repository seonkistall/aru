import type { ConsentEvent, ConsentKind } from "@/lib/consent";

export function resolveCaptureConsent(
  events: ConsentEvent[],
  kind: ConsentKind,
  uiGranted: boolean,
  scope?: { participantId: string; sessionId: string },
): ConsentEvent | null {
  if (!uiGranted) return null;
  const eligible = events.filter((event) => {
    if (event.kind !== kind) return false;
    if (!scope) return event.participantId === undefined && event.sessionId === undefined;
    return event.participantId === scope.participantId && event.sessionId === scope.sessionId;
  });
  const latest = eligible.at(-1) ?? null;
  return latest?.granted ? latest : null;
}
