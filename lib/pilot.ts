export type PilotLighting = "window" | "ceiling" | "dim" | "backlight" | "direct";
export type PilotBrowser = "ios-safari" | "android-chrome" | "desktop" | "other";

export type PilotNote = {
  id: string;
  participant: string;
  browser: PilotBrowser;
  lighting: PilotLighting;
  makeup: "none" | "light" | "heavy";
  glasses: boolean;
  hairCover: boolean;
  scanCompleted: boolean;
  consentAi: boolean;
  consentCrop: boolean;
  notes: string;
  ts: number;
};

const KEY = "gyeol_pilot_notes_v1";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

export function getPilotNotes(): PilotNote[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function pilotNoteCount(): number {
  return getPilotNotes().length;
}

export function summarizePilotNotes() {
  const rows = getPilotNotes();
  const byBrowser = countBy(rows, (row) => row.browser);
  const byLighting = countBy(rows, (row) => row.lighting);

  return {
    total: rows.length,
    completed: rows.filter((row) => row.scanCompleted).length,
    aiConsent: rows.filter((row) => row.consentAi).length,
    cropConsent: rows.filter((row) => row.consentCrop).length,
    blockedByMakeupOrObstruction: rows.filter((row) => row.makeup === "heavy" || row.glasses || row.hairCover).length,
    byBrowser,
    byLighting,
  };
}

export function savePilotNote(note: Omit<PilotNote, "id" | "ts">): PilotNote {
  const rec: PilotNote = { ...note, id: uid(), ts: Date.now() };
  const all = getPilotNotes();
  all.push(rec);
  localStorage.setItem(KEY, JSON.stringify(all));
  return rec;
}

export function exportPilotNotes() {
  const rows = getPilotNotes();
  const header = ["id", "participant", "browser", "lighting", "makeup", "glasses", "hairCover", "scanCompleted", "consentAi", "consentCrop", "notes", "ts"];
  const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => esc(row[key as keyof PilotNote])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyeol-pilot-notes-${rows.length}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearPilotNotes() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

function countBy<T extends string>(rows: PilotNote[], getKey: (row: PilotNote) => T): Partial<Record<T, number>> {
  return rows.reduce(
    (acc, row) => {
      const key = getKey(row);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<T, number>>
  );
}
