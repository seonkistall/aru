"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { notePageViewNavigation } from "@/lib/funnel";

/**
 * Keeps `recordPageView`'s once-per-visit guard in step with EVERY navigation, not
 * only the ones that land on a page which records a view.
 *
 * Mounted in the root layout outside `LanguageProvider`, so the `key={lang}` remount
 * that made page views fire twice does not remount this; its effect runs only when
 * the pathname actually changes. Renders nothing and records nothing.
 */
export function PageViewScope() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) notePageViewNavigation(pathname);
  }, [pathname]);
  return null;
}
