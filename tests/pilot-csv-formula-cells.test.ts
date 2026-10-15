import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";
import { exportPilotNotes } from "@/lib/pilot";

/**
 * The pilot CSV let a note open as a formula.
 *
 * exportPilotNotes quoted every field, but a spreadsheet still treats a quoted cell that
 * starts with = (and, in Excel and Google Sheets, + - @) as a formula. An operator's
 * note in the common arrow style "=> 재촬영 필요" opened as Err:510 in LibreOffice and
 * was saved back as Err:510. Such a cell now gets a leading apostrophe; the columns the ML
 * pipeline reads are enums and booleans and are unchanged. Found by the cycle 119 bug
 * hunt.
 */

function note(notes: string, excludedReason = "") {
  return {
    id: "n1", participant: "P001", participantId: "P001", sessionId: "P001-1", round: "pilot-1", deviceId: "d1", reviewerId: "r1",
    status: "scanned", browser: "ios-safari", lighting: "window", makeup: "none", glasses: false, hairCover: false,
    scanCompleted: true, secondReviewNeeded: false, excludedReason, consentAi: true, consentCrop: true, notes, ts: 1,
  };
}

async function exported(notes: ReturnType<typeof note>[]) {
  const data = new Map([[DEVICE_DATA_KEY.pilotNotes as string, JSON.stringify(notes)]]);
  let blob: Blob | null = null;
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("document", { createElement: () => ({ click: () => {} }) });
  vi.stubGlobal("URL", { createObjectURL: (value: Blob) => ((blob = value), "blob:x"), revokeObjectURL: () => {} });
  exportPilotNotes();
  return (blob as Blob | null)?.text() ?? "";
}

afterEach(() => vi.unstubAllGlobals());

describe("pilot CSV cells a spreadsheet would run as formulas", () => {
  it("keeps notes starting with = + - @ as text", async () => {
    const csv = await exported([note("=> 재촬영 필요 (2분 후)"), note("+ hair over forehead"), note("- glare"), note("@reviewer-b 확인")]);
    expect(csv).toContain(`"'=> 재촬영 필요 (2분 후)"`);
    expect(csv).toContain(`"'+ hair over forehead"`);
    expect(csv).toContain(`"'- glare"`);
    expect(csv).toContain(`"'@reviewer-b 확인"`);
    expect(csv).not.toMatch(/,"[=+\-@]/);
  });

  it("leaves ordinary notes and the pipeline's columns as they were", async () => {
    const csv = await exported([note('조명 "창가", 정면')]);
    const [header, row] = csv.split("\n");
    expect(header.split(",")).toContain("scanCompleted");
    expect(row).toContain(`"조명 ""창가"", 정면"`);
    expect(row).toContain(`"ios-safari","window","none","false","false","true"`);
  });
});
