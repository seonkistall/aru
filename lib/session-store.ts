// The session-scoped values the /scan → /survey → /report → /care funnel hands from
// one screen to the next, with an in-memory fallback for the browsers that refuse to
// store them.
//
// Why it exists. `/survey`'s submit wrote the answers to `sessionStorage` and, on a
// throw, showed "설문을 저장하지 못했어요…" and returned; `/report` and `/care` read the
// same answers back out of `sessionStorage` and nowhere else. So in a browser that
// refuses site storage the funnel ENDED at `/survey`: no report, no merchant link.
// Three ways a browser gets there, all of them real: Chrome with "block all cookies",
// where touching `window.sessionStorage` throws a SecurityError; some in-app browsers;
// and a full quota, which throws on the write only.
//
// Scope, deliberately narrow. This is the fallback for the keys those four screens
// pass between themselves and nothing else. It adds no storage key. It never writes to
// `localStorage`. It holds no consent — `lib/consent.ts` keeps its own storage and
// keeps it where it is. `clearAllDeviceData` empties the Map below, so "내 기기 데이터
// 삭제" still clears everything ARU put in this browser.
//
// The limit, stated rather than hidden. The Map is module state, so it survives
// `router.push` (app-router navigation keeps the JS context alive) and does NOT survive
// a full page reload or a new tab. A visitor whose browser refuses storage gets the
// funnel from /survey through /report to /care; a reload puts them back at the start.
const memory = new Map<string, string>();

/** `sessionStorage` first, then whatever this module had to keep in memory. */
export function sessionGet(key: string): string | null {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // The browser refused the read — a blocked store, or no `sessionStorage` at all.
    // The Map below is the whole reason this function exists.
  }
  return memory.get(key) ?? null;
}

/** Writes to `sessionStorage`, and keeps the value in memory when that throws. */
export function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
    // The write landed, so anything the Map was holding under this key is stale.
    // `sessionGet` prefers storage and would not have returned it, but a stale copy
    // left behind would outlive the next `sessionRemove` of the real value.
    memory.delete(key);
    return;
  } catch {
    // Quota, or a browser that refuses site storage.
  }
  memory.set(key, value);
}

/** Removes from both, because a value may be in either. */
export function sessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing of ours is there to remove; the Map still has to be cleared.
  }
  memory.delete(key);
}

/**
 * Drops every value this module is holding in memory. Called by
 * `clearAllDeviceData` (`lib/device-data.ts`), so "delete my device data" clears the
 * fallback as well as the two browser stores — otherwise a wiped device would go on
 * serving its own survey back to /report for the rest of the tab session.
 */
export function clearSessionFallback(): void {
  memory.clear();
}
