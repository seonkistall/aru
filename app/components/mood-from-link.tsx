"use client";

// Viral entry: when someone opens a shared aru link (#m=NNN), show the friend's
// skin mood and a scan CTA. Reads the hash after mount (client-only), so there's
// no SSR/hydration mismatch. The hash is never sent to the server.
import Link from "next/link";
import { useEffect, useState } from "react";
import { moodSummary, readMoodFromHash, type MoodLevels } from "@/lib/share-link";

export function MoodFromLink() {
  const [mood, setMood] = useState<MoodLevels | null>(null);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMood(readMoodFromHash(window.location.hash));
  }, []);

  if (!mood) return null;

  return (
    <div style={{ margin: "0 24px 18px", padding: "14px 16px", border: "1.6px solid var(--plum)", borderRadius: 10, background: "var(--surface)", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-hand)", fontSize: 20, color: "var(--ink)" }}>친구가 피부 무드를 공유했어요</p>
      <p style={{ fontSize: 13.5, color: "var(--plum)", margin: "4px 0 10px" }}>{moodSummary(mood)}</p>
      <Link
        href="/scan"
        style={{ fontFamily: "var(--font-hand)", fontSize: 19, color: "var(--plum)", textDecoration: "none", borderBottom: "2px solid var(--plum)", paddingBottom: 1 }}
      >
        나도 30초 스캔하기 →
      </Link>
    </div>
  );
}
