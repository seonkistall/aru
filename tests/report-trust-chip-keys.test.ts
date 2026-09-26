import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReportTrust } from "@/lib/report-trust";
import type { ConfidenceSignal } from "@/lib/skin";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { AR } from "@/lib/i18n/ar";

/**
 * Regression, cycle 43 supervisor review. `signalCheck` in `lib/report-trust.ts`
 * composes a chip as `${label} 확인` / `${label} 보류` for any signal it has no
 * special case for, and /report passes the result through `t()` at render. The
 * translation-coverage test only sees `t("...")` literals, so a composed string
 * that is not a key rendered as Korean in every other locale: `노출 여유 확인`,
 * found by the cycle 43 sweep on /report's first screen in en, ja, zh and ar.
 *
 * The labels and details are read from `buildSignals` in `lib/skin.ts` rather
 * than listed here, so a fifth signal added there is checked without anyone
 * remembering this file.
 */
const skin = readFileSync(resolve(import.meta.dirname, "../lib/skin.ts"), "utf8");
const start = skin.indexOf("function buildSignals(");
const end = skin.indexOf("satisfies ConfidenceSignal[]", start);
const block = skin.slice(start, end);
const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
const details = [...block.matchAll(/"([^"]*[가-힣][^"]*)"/g)].map((m) => m[1]).filter((s) => !labels.includes(s));

const DICTS = { en: EN, ja: JA, zh: ZH, ar: AR } as const;

function checksFor(signal: ConfidenceSignal): string[] {
  return buildReportTrust(
    {
      confidence: 0.8,
      confidenceLabel: "보통",
      retakeRecommended: false,
      retakeReasons: [],
      source: "roi-calibrated",
      signals: [signal],
    },
    true,
  ).checks;
}

describe("every trust chip /report can render is a dictionary key", () => {
  it("reads the four signals and their details out of buildSignals", () => {
    expect(labels).toEqual(["조명", "반사", "노출 여유", "피부 영역"]);
    expect(details.length).toBeGreaterThanOrEqual(labels.length * 2);
  });

  const chips = new Set<string>();
  for (const label of labels) {
    for (const detail of details) {
      for (const ok of [true, false]) {
        for (const chip of checksFor({ label, ok, detail })) chips.add(chip);
      }
    }
  }

  for (const [lang, dict] of Object.entries(DICTS)) {
    it(`has a ${lang} entry for each of them`, () => {
      const missing = [...chips].filter((chip) => !(chip in dict));
      expect(missing, `${lang} would render these chips in Korean`).toEqual([]);
    });
  }
});
