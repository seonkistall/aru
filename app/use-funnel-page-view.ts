"use client";

import { useEffect, useRef } from "react";
import { recordFunnelEvent, type FunnelEventKind } from "@/lib/funnel";

/**
 * Record one funnel event when a page mounts, exactly once.
 *
 * The ref guard is not optional: React StrictMode double-invokes effects in dev,
 * which would double every page-view count in a research export. Same guard as
 * `MoodFromLink` and `app/survey/page.tsx`, factored out now that four pages need it.
 *
 * Deliberately takes no props. A page-view event carries nothing but the fact of the
 * view, and a props argument would have to be captured on the first render to avoid
 * re-firing — which is a trap, not a feature. A call site that needs properties
 * should use `recordFunnelEvent` directly with its own guard.
 *
 * `recordFunnelEvent` swallows its own storage failures and returns null, so this
 * can never break a page render.
 */
export function useFunnelPageView(kind: FunnelEventKind) {
  const recorded = useRef(false);
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    recordFunnelEvent(kind);
  }, [kind]);
}
