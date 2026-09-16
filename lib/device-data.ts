export const DEVICE_DATA_KEY = {
  language: "aru.lang",
  lastResult: "aru_last_result",
  scanHistory: "aru_scan_history_v1",
  consentEvents: "gyeol_consent_events_v1",
  cropSamples: "gyeol_crop_samples_v1",
  funnelEvents: "aru_funnel_events_v1",
  funnelVisitor: "aru_funnel_visitor_v1",
  funnelSession: "aru_funnel_session_v1",
  // Ids already acknowledged by a server, so a flush does not re-send them.
  // Listed below like every other key: "delete my device data" must clear the
  // cursor too, or a wiped device would go on suppressing its own events.
  funnelFlushed: "aru_funnel_flushed_v1",
  labels: "gyeol_labels_v1",
  pilotNotes: "gyeol_pilot_notes_v1",
  pilotSession: "gyeol_current_pilot_session_v1",
  purchases: "gyeol_purchases",
  checkins: "gyeol_checkins",
  careIntents: "gyeol_care_intents",
  scan: "gyeol_scan",
  reads: "gyeol_reads",
  survey: "gyeol_survey",
} as const;

type DeviceDataArea = "local" | "session";
type DeviceDataGroup = "preferences" | "scan" | "survey" | "research" | "activity" | "analytics";
type DeviceDataEntry = { key: (typeof DEVICE_DATA_KEY)[keyof typeof DEVICE_DATA_KEY]; area: DeviceDataArea; group: DeviceDataGroup };

export const DEVICE_DATA_KEYS = [
  { key: DEVICE_DATA_KEY.language, area: "local", group: "preferences" },
  { key: DEVICE_DATA_KEY.lastResult, area: "local", group: "scan" },
  { key: DEVICE_DATA_KEY.scanHistory, area: "local", group: "scan" },
  { key: DEVICE_DATA_KEY.consentEvents, area: "local", group: "research" },
  { key: DEVICE_DATA_KEY.cropSamples, area: "local", group: "research" },
  { key: DEVICE_DATA_KEY.funnelEvents, area: "local", group: "analytics" },
  { key: DEVICE_DATA_KEY.funnelVisitor, area: "local", group: "analytics" },
  { key: DEVICE_DATA_KEY.funnelSession, area: "session", group: "analytics" },
  { key: DEVICE_DATA_KEY.funnelFlushed, area: "local", group: "analytics" },
  { key: DEVICE_DATA_KEY.labels, area: "local", group: "research" },
  { key: DEVICE_DATA_KEY.pilotNotes, area: "local", group: "research" },
  { key: DEVICE_DATA_KEY.pilotSession, area: "local", group: "research" },
  { key: DEVICE_DATA_KEY.purchases, area: "local", group: "activity" },
  { key: DEVICE_DATA_KEY.checkins, area: "local", group: "activity" },
  { key: DEVICE_DATA_KEY.careIntents, area: "local", group: "activity" },
  { key: DEVICE_DATA_KEY.scan, area: "session", group: "scan" },
  { key: DEVICE_DATA_KEY.reads, area: "session", group: "scan" },
  { key: DEVICE_DATA_KEY.survey, area: "session", group: "survey" },
] as const satisfies readonly DeviceDataEntry[];

type DeviceStorageArea = Pick<Storage, "getItem" | "removeItem">;
export type DeviceStorage = { local: DeviceStorageArea; session: DeviceStorageArea };

export function remainingDeviceDataKeys(storage: DeviceStorage): string[] {
  return DEVICE_DATA_KEYS.flatMap((entry) => {
    try {
      return storage[entry.area].getItem(entry.key) === null ? [] : [entry.key];
    } catch {
      return [entry.key];
    }
  });
}

export function clearAllDeviceData(storage: DeviceStorage): string[] {
  for (const entry of DEVICE_DATA_KEYS) {
    try {
      storage[entry.area].removeItem(entry.key);
    } catch {
      // Verification below reports keys that storage refused to delete.
    }
  }
  return remainingDeviceDataKeys(storage);
}
