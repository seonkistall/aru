import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clearAllDeviceData, DEVICE_DATA_KEYS, remainingDeviceDataKeys, type DeviceStorage } from "@/lib/device-data";

const expected = [
  "aru.lang",
  "aru_last_result",
  "aru_scan_history_v1",
  "gyeol_consent_events_v1",
  "gyeol_crop_samples_v1",
  "aru_funnel_events_v1",
  "aru_funnel_visitor_v1",
  "aru_funnel_session_v1",
  "aru_funnel_flushed_v1",
  "gyeol_labels_v1",
  "gyeol_pilot_notes_v1",
  "gyeol_current_pilot_session_v1",
  "gyeol_purchases",
  "gyeol_checkins",
  "gyeol_care_intents",
  "gyeol_scan",
  "gyeol_reads",
  "gyeol_survey",
];
const root = resolve(import.meta.dirname, "..");

function memoryStorage(failingKey?: string) {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      removeItem(key: string) {
        if (key === failingKey) throw new Error("blocked");
        values.delete(key);
      },
    },
  };
}

function seededStorage(failingKey?: string): { device: DeviceStorage; local: Map<string, string>; session: Map<string, string> } {
  const local = memoryStorage(failingKey);
  const session = memoryStorage(failingKey);
  for (const entry of DEVICE_DATA_KEYS) {
    (entry.area === "local" ? local : session).values.set(entry.key, "stored");
  }
  local.values.set("unrelated", "keep");
  return { device: { local: local.storage, session: session.storage }, local: local.values, session: session.values };
}

describe("device data registry", () => {
  it("lists every ARU browser key exactly once", () => {
    const keys = DEVICE_DATA_KEYS.map((entry) => entry.key);
    expect(keys).toHaveLength(new Set(keys).size);
    expect([...keys].sort()).toEqual([...expected].sort());
  });

  it("clears every registered key and preserves unrelated browser data", () => {
    const { device, local } = seededStorage();
    expect(clearAllDeviceData(device)).toEqual([]);
    expect(remainingDeviceDataKeys(device)).toEqual([]);
    expect(local.get("unrelated")).toBe("keep");
  });

  it("reports a key when deletion cannot be verified", () => {
    const { device } = seededStorage("aru_last_result");
    expect(clearAllDeviceData(device)).toEqual(["aru_last_result"]);
  });

  it("keeps registered key literals out of storage consumers", () => {
    const consumers = [
      "app/care/page.tsx",
      "app/report/page.tsx",
      "app/scan/page.tsx",
      "app/studio/page.tsx",
      "app/survey/page.tsx",
      "lib/consent.ts",
      "lib/crops.ts",
      "lib/funnel.ts",
      "lib/i18n/core.ts",
      "lib/labels.ts",
      "lib/last-result.ts",
      "lib/pilot.ts",
      "lib/scan-history.ts",
      "lib/store.ts",
    ];

    for (const path of consumers) {
      const source = readFileSync(resolve(root, path), "utf8");
      for (const key of expected) expect(source, `${path} owns ${key}`).not.toContain(JSON.stringify(key));
    }
  });

  it("requires confirmation and verification before claiming device deletion", () => {
    const privacy = readFileSync(resolve(root, "app/privacy/page.tsx"), "utf8");
    expect(privacy).toContain('setDeleteState("confirm")');
    expect(privacy).toContain("clearAllDeviceData({ local: window.localStorage, session: window.sessionStorage })");
    expect(privacy).toContain("remaining.length === 0");
    expect(privacy).toContain("스캔 결과, 설문, 체크인과 설정이 삭제돼요.");
    expect(privacy).toContain("이메일 알림과 연구 서버 데이터는 포함되지 않아요.");
  });
});
