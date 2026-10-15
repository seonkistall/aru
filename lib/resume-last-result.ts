// The fresh-tab half of `lib/last-result.ts`: hands the saved result back to the tab
// session, so every screen that reads the session sees it the way it would have had the
// survey been submitted in this tab.
//
// Why it exists. /report and /care used to RENDER from `aru_last_result` when the tab
// session held no survey, and leave the session empty. Every screen after them reads the
// session and nothing else, so: /survey (where /report's scan nudge leads, through /scan)
// came back with every answer gone; a scan taken in this tab never reached the report,
// because coming back found the session still without a survey and went down the same
// fallback again; and a days-old camera reading stayed on screen (on /report, beside a
// history strip that said "오늘").
//
// What it writes. The survey, always: the caller has just found none. The reading only
// when the session holds no usable one, because a scan taken in this tab is newer than
// anything saved and wins. `scan` and `reads` are one reading, written together by
// /scan, so a usable value under either key keeps both saved ones out: an old `reads`
// beside a new `scan` would describe a different photo from the one the picks were
// scored on.
//
// With the saved reading it also writes the marker /survey keeps after a submit: which
// scan hint the submitted answers already absorbed (`hintFor`, app/survey/page.tsx).
// That marker lived in the old tab's session only, so without it /survey in this tab
// would add the saved scan's concerns back to the restored answers, re-pressing one the
// visitor had unpressed and submitted (the same-tab case is regression-49).
//
// What it does not write is `aru_last_result` itself. Resuming a result is not a new
// result; whether anything changed is the caller's call (`loadInitialView`,
// `app/report/page.tsx`). No storage key of its own, and nothing outside the tab session.
import { DEVICE_DATA_KEY } from "./device-data";
import { isScanReads, isSkinReads, loadLastResult } from "./last-result";
import { scanSignalConcerns } from "./recommend";
import { sessionGet, sessionRemove, sessionSet } from "./session-store";

function sessionHoldsReading(): boolean {
  try {
    const scanRaw = sessionGet(DEVICE_DATA_KEY.scan);
    if (scanRaw !== null && isScanReads(JSON.parse(scanRaw))) return true;
  } catch {}
  try {
    const readsRaw = sessionGet(DEVICE_DATA_KEY.reads);
    if (readsRaw !== null && isSkinReads(JSON.parse(readsRaw))) return true;
  } catch {}
  return false;
}

// A draft /survey wrote on a mere look, before anything was tapped. /survey writes one on
// every mount and applies a draft over the submitted survey as "the newer of the two", so
// a look at /survey in this tab before /report resumed would wipe the resumed concerns and
// avoid list (an empty list is a real answer) and let a scan hint press its concerns
// again. A look leaves every answer field empty, with hintFor null, or "" when the scan in
// this tab flags nothing; or, when it flags something, with concerns equal to exactly the
// hint's list, which the page pressed by itself. A draft that holds any other answer is
// left alone. One the visitor emptied again by hand looks the same as a look and is
// treated as one, which drops nothing it held.
function sessionDraftIsUntouched(): boolean {
  try {
    const raw = sessionGet(DEVICE_DATA_KEY.surveyDraft);
    if (raw === null) return false;
    const draft = JSON.parse(raw) as Record<string, unknown> | null;
    if (!draft || typeof draft !== "object") return false;
    const empty = (value: unknown) =>
      value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (!["type", "category", "budget", "avoid"].every((key) => empty(draft[key]))) return false;
    if (empty(draft.hintFor)) return empty(draft.concerns);
    const hinted = typeof draft.hintFor === "string" ? draft.hintFor.split(",") : null;
    const concerns = draft.concerns;
    return (
      hinted !== null &&
      Array.isArray(concerns) &&
      concerns.length === hinted.length &&
      hinted.every((concern) => concerns.includes(concern))
    );
  } catch {
    return false;
  }
}

/** False when there is no saved result to resume; the session is then left as it was. */
export function resumeLastResult(): boolean {
  const saved = loadLastResult();
  if (!saved) return false;
  sessionSet(DEVICE_DATA_KEY.survey, JSON.stringify(saved.survey));
  const untouched = sessionDraftIsUntouched();
  let hintFor = "";
  if (!sessionHoldsReading()) {
    if (saved.scan) sessionSet(DEVICE_DATA_KEY.scan, JSON.stringify(saved.scan));
    if (saved.reads) sessionSet(DEVICE_DATA_KEY.reads, JSON.stringify(saved.reads));
    hintFor = scanSignalConcerns(saved.scan ?? null).join(",");
  }
  if (hintFor && (untouched || sessionGet(DEVICE_DATA_KEY.surveyDraft) === null)) {
    sessionSet(DEVICE_DATA_KEY.surveyDraft, JSON.stringify({ hintFor }));
  } else if (untouched) {
    sessionRemove(DEVICE_DATA_KEY.surveyDraft);
  }
  return true;
}
