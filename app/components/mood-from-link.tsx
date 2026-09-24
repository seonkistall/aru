"use client";

// Viral entry: when someone opens a shared aru link (#m=NNN), show the friend's
// skin mood and a scan CTA. Reads the hash after mount (client-only), so there's
// no SSR/hydration mismatch. The hash is never sent to the server.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { moodSummary, readMoodFromHash, type MoodLevels } from "@/lib/share-link";
import { recordPageView } from "@/lib/funnel";
import { t } from "@/lib/i18n/core";

export function MoodFromLink() {
  const [mood, setMood] = useState<MoodLevels | null>(null);
  // StrictMode double-invokes effects in dev. Same guard as app/survey/page.tsx.
  // The ref alone is not enough: LanguageProvider remounts this subtree at hydration
  // for every saved language but `en`, which recreates it — hence recordPageView.
  const landingRecorded = useRef(false);

  useEffect(() => {
    const arrived = readMoodFromHash(window.location.hash);
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMood(arrived);
    // The receiving half of the share loop. share_clicked counted sends; nothing
    // counted arrivals, so the loop had no denominator and no UX cycle could tell
    // whether a change to the share surface did anything. Reads the hash already
    // parsed above — no new network call, nothing extra leaves the device, and
    // recordPageView, and recordFunnelEvent beneath it, swallow their own storage failures.
    if (arrived && !landingRecorded.current) {
      landingRecorded.current = true;
      recordPageView("share_landed");
    }
  }, []);

  if (!mood) return null;

  return (
    <div style={{ margin: "0 24px 18px", padding: "14px 16px", border: "1.6px solid var(--plum)", borderRadius: 10, background: "var(--surface)", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)" }}>{t("친구가 피부 무드를 공유했어요")}</p>
      <p style={{ fontSize: 13.5, color: "var(--plum)", margin: "4px 0 10px" }}>{t(moodSummary(mood))}</p>
      <Link
        href="/scan"
        style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--plum)", textDecoration: "none", borderBottom: "2px solid var(--plum)", paddingBottom: 1 }}
      >
        {t("나도 30초 스캔하기 →")}
      </Link>
    </div>
  );
}
