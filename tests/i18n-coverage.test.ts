import { afterEach, describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { setCurrentLang } from "@/lib/i18n/core";
import { buildReportTrust, type ReportTrustInput } from "@/lib/report-trust";
import { moodSummary } from "@/lib/share-link";
import { clinicLinks } from "@/lib/care";

const DICTS: Record<string, Record<string, string>> = { en: EN, ja: JA, zh: ZH };
const HANGUL = /[가-힣]/;

function expectCovered(msgid: string) {
  for (const [lang, dict] of Object.entries(DICTS)) {
    expect(dict[msgid], `"${msgid}" missing from ${lang} dictionary`).toBeTruthy();
    expect(dict[msgid]).not.toMatch(HANGUL);
  }
}

describe("dictionary coverage for runtime-composed strings", () => {
  afterEach(() => setCurrentLang("ko"));

  it("covers all three report trust card variants (title + body)", () => {
    const reads: ReportTrustInput = {
      confidence: 0.5,
      confidenceLabel: "보통",
      retakeRecommended: false,
      retakeReasons: [],
      source: "roi-calibrated",
      signals: [],
    };
    const variants = [
      buildReportTrust({ ...reads, retakeRecommended: true }, false),
      buildReportTrust(reads, false),
      buildReportTrust(reads, true),
    ];
    for (const trust of variants) {
      expectCovered(trust.title);
      expectCovered(trust.body);
    }
  });

  it("covers every mood share-link label in every language", () => {
    for (const lang of ["en", "ja", "zh"] as const) {
      setCurrentLang(lang);
      for (let oil = 0; oil <= 2; oil++) {
        for (let redness = 0; redness <= 2; redness++) {
          for (let pores = 0; pores <= 2; pores++) {
            const summary = moodSummary({ oil, redness, pores });
            expect(summary, `Korean leaked in ${lang} mood summary for ${oil}${redness}${pores}`).not.toMatch(HANGUL);
          }
        }
      }
    }
  });

  it("covers clinic link labels/notes stored Korean-canonical", () => {
    for (const link of clinicLinks("ko")) {
      expect(link.label).toMatch(HANGUL); // stored canonical, not pre-translated
      expectCovered(link.label);
      expectCovered(link.note);
    }
  });

  it("covers both feedback save messages composed at render time", () => {
    expectCovered("고마워요. {count}번째 피부 피드백이에요.");
    expectCovered("저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요.");
  });
});
