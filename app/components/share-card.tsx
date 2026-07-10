"use client";

import { forwardRef } from "react";
import type { SkinReads } from "@/lib/skin";
import { t } from "@/lib/i18n/core";

export type CardRead = { label: string; value: string; calm?: boolean };

// The branded 9:16 skin-mood card. Shared by /studio (editable) and the scan
// result screen (one-tap share) so the shareable image has a single source of
// truth. Rendered off-screen when only used to rasterize.
export const ShareCard = forwardRef<HTMLDivElement, { headline: string; reads: CardRead[] }>(
  function ShareCard({ headline, reads }, ref) {
    return (
      <div ref={ref} style={cardPreview}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--ink)" }}>{t("아루")}</span>
          <span style={miniLabel}>skin mood</span>
        </div>
        <h2 style={cardHeadline}>{t(headline)}</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 26 }}>{t("보이는 특징만 정직하게 읽었어요.")}</p>
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {reads.map((read) => (
            <div key={read.label} style={rowStyle}>
              <span style={{ fontSize: 14, color: "var(--ink)" }}>{t(read.label)}</span>
              <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: read.calm ? "var(--text-muted)" : "var(--plum)" }}>{t(read.value)}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ height: 1, width: 34, background: "var(--bronze)", margin: "0 auto 16px", opacity: 0.75 }} />
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>{t("30초 피부 스캔")}</p>
      </div>
    );
  }
);

export function skinReadsToCard(reads: SkinReads): { headline: string; rows: CardRead[] } {
  return {
    headline: reads.headline,
    rows: [
      { label: "유분", value: reads.oil.value, calm: reads.oil.calm },
      { label: "모공/결", value: reads.pores.value, calm: reads.pores.calm },
      { label: "붉은기", value: reads.redness.value, calm: reads.redness.calm },
      { label: "전반", value: reads.overall.value, calm: reads.overall.calm },
    ],
  };
}

export type ShareMode = "web-share" | "download";

async function rasterize(node: HTMLElement): Promise<string> {
  await document.fonts.ready;
  // Load html-to-image only when the user actually shares, so it isn't bundled
  // into every page that merely renders a card (scan result, studio).
  const { toPng } = await import("html-to-image");
  return toPng(node, { pixelRatio: 3, cacheBust: true, backgroundColor: "#ffffff" });
}

// Rasterize the card and hand it to the OS share sheet, falling back to a PNG
// download where Web Share with files is unavailable (most desktop browsers).
// onShare fires right before the action so callers can log intent with their
// own surface label. AbortError (user dismissed the sheet) propagates so the
// caller can ignore it silently.
export async function shareCardImage(
  node: HTMLElement,
  opts?: { onShare?: (mode: ShareMode) => void; shareUrl?: string }
): Promise<ShareMode> {
  const dataUrl = await rasterize(node);
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], "aru-skin-card.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      // Include the deep link so the shared post carries a way back to aru (viral
      // loop); platforms that ignore url alongside files still share the image.
      await navigator.share({
        files: [file],
        title: t("아루 피부 카드"),
        ...(opts?.shareUrl ? { text: t("내 피부 무드 — 아루"), url: opts.shareUrl } : {}),
      });
      opts?.onShare?.("web-share");
      return "web-share";
    } catch (error) {
      // User dismissed the sheet — that's a cancel, not a failure; propagate.
      if ((error as Error).name === "AbortError") throw error;
      // Web Share rejected (e.g. iOS drops user activation after the async
      // raster) — fall through to the download so the user still gets a card.
    }
  }
  const a = document.createElement("a");
  a.download = "aru-skin-card.png";
  a.href = dataUrl;
  a.click();
  opts?.onShare?.("download");
  return "download";
}

export async function downloadCardImage(node: HTMLElement): Promise<void> {
  const dataUrl = await rasterize(node);
  const a = document.createElement("a");
  a.download = "aru-skin-card.png";
  a.href = dataUrl;
  a.click();
}

const miniLabel: React.CSSProperties = { fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const cardPreview: React.CSSProperties = { width: 360, height: 640, background: "var(--paper)", padding: "34px 30px", display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" };
const cardHeadline: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 40, lineHeight: 1.2, color: "var(--ink)", margin: "30px 0 6px", whiteSpace: "pre-line" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "13px 0", borderBottom: "1px solid var(--line)" };
