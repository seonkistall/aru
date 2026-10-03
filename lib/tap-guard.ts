/**
 * A re-entrancy guard for a click handler that must stay synchronous.
 *
 * The defect it exists for, measured on a production build at 360x800 in `ko`
 * before this module existed: one `dblclick` on `/care`'s purchase button called
 * `window.open` twice and recorded `commerce_clicked` twice; one `dblclick` on
 * `/report`'s summary link or a product card's link opened 2 tabs and recorded
 * `commerce_clicked` twice. What that cost: a second merchant tab, a second
 * `/api/out` request, and on `/care` a second care-intent row (`recordCareIntent`,
 * the click log `/privacy` counts). It did NOT move a conversion rate:
 * `summarizeFunnel` (`lib/funnel.ts`) counts distinct sessions per step, so a
 * duplicate event in the same session is counted once there already.
 *
 * Why a time window and not an in-flight flag: these three handlers have nothing
 * in flight. `/care`'s `openCareLink` MUST call `window.open` synchronously inside
 * the click gesture — the comment above it says why: awaiting anything first pushes
 * the open past the user-gesture window and popup blockers kill it — and the two
 * `<a target="_blank">` surfaces are the browser's own navigation, which is over
 * before the handler returns. There is no promise to hang a flag on, so the only
 * thing that separates an accidental double-tap from a deliberate second visit is
 * how far apart they are. `/survey`'s submit DOES have something in flight
 * (`router.push`) and uses a plain `useRef` flag instead, not this.
 *
 * The window is measured from the last ACCEPTED tap, not the last tap seen, so a
 * run of rapid taps cannot extend the suppression indefinitely: at 500 ms spacing
 * the tap at 0 ms is accepted, the one at 500 ms suppressed, and the one at 1000 ms
 * accepted again. A deliberate second click after the window therefore still opens
 * and still records, which is the behaviour that must survive — a visitor who comes
 * back to the same merchant link is a real second click and the funnel should see it.
 *
 * Pinned by tests/tap-guard.test.ts (fake timers) and
 * tests/e2e/double-tap-funnel.regression-46.spec.ts (a real browser).
 */

/**
 * How long after an accepted tap a second tap on the same key is treated as part of
 * the same gesture.
 *
 * 800 ms: comfortably above the ~500 ms a browser itself uses to pair two clicks
 * into a `dblclick`, and well under the time it takes a visitor to read a merchant
 * page, come back and decide to tap again. Nothing in the product reads this value;
 * it is only the width of the suppression window.
 */
export const TAP_GUARD_WINDOW_MS = 800;

export type TapGuard = (key: string) => boolean;

/**
 * Returns a guard function. The guard answers "is this tap a repeat of one I have
 * already let through for this key, inside the window?" — `true` means the caller
 * should do nothing (and, for an anchor, `preventDefault()` the navigation the
 * browser would otherwise do).
 */
export function createTapGuard(windowMs: number = TAP_GUARD_WINDOW_MS): TapGuard {
  // Keyed by href, so two different merchant links on the same screen never block
  // each other. Entries that fall out of the window are dropped on the next call,
  // so a long session cannot grow this without bound.
  const accepted = new Map<string, number>();
  return function isRepeatTap(key: string): boolean {
    const now = Date.now();
    // `Date.now()` is wall-clock time and can step BACKWARDS (an NTP correction, a
    // manual clock change). A negative age is therefore treated as outside the window,
    // not inside it: otherwise a clock stepped back by N seconds would keep that link
    // suppressed for N seconds plus the window. Found by the cycle 70 supervisor review.
    for (const [seen, at] of accepted) {
      const age = now - at;
      if (age < 0 || age >= windowMs) accepted.delete(seen);
    }
    if (accepted.has(key)) return true;
    accepted.set(key, now);
    return false;
  };
}
