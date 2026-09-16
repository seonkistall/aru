"use client";

import { useEffect, useRef } from "react";
import { flushFunnelEvents } from "@/lib/funnel-flush";

/**
 * The automatic call site `lib/funnel.ts` never had.
 *
 * Mounted once in the root layout. With `NEXT_PUBLIC_FUNNEL_FLUSH` unset — which is
 * how it ships — `flushFunnelEvents` returns `disabled` before touching the network,
 * so this component adds no request, no storage write and no behaviour to any
 * browser. The listeners are still attached in that case on purpose: an effect that
 * exists only under a flag is an effect nobody notices is broken.
 *
 * Two triggers, both cheap:
 * - mount, which drains whatever an earlier visit left behind;
 * - `visibilitychange` to hidden, the last moment a mobile browser reliably runs
 *   script. `pagehide` is not used: on iOS it fires on bfcache entry too, and the
 *   hidden transition already precedes it in every case that matters.
 *
 * `flushFunnelEvents` resolves rather than rejects, so nothing here can surface an
 * unhandled rejection in a user's console; the `void` is only for the linter.
 */
export function FunnelFlush() {
  const flushing = useRef(false);

  useEffect(() => {
    const run = () => {
      if (flushing.current) return;
      flushing.current = true;
      void flushFunnelEvents().finally(() => {
        flushing.current = false;
      });
    };

    run();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
