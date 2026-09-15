import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { AR } from "@/lib/i18n/ar";
import { setCurrentLang } from "@/lib/i18n/core";
import { buildReportTrust, type ReportTrustInput } from "@/lib/report-trust";
import { moodSummary } from "@/lib/share-link";
import { clinicLinks } from "@/lib/care";

const DICTS: Record<string, Record<string, string>> = { en: EN, ja: JA, zh: ZH, ar: AR };
const HANGUL = /[가-힣]/;
const root = resolve(import.meta.dirname, "..");

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

  it("covers the source label of every analysis source", () => {
    // sourceLabel is stored in a map and passed to t() as a variable, so the
    // literal scan below cannot see it. It went untranslated in all four
    // languages — including English, the default — and showed raw Korean as the
    // first chip on the /report trust card.
    const sources = ["roi-calibrated", "vision-api", "ml-model"] as const;
    for (const source of sources) {
      const trust = buildReportTrust(
        {
          confidence: 0.5,
          confidenceLabel: "보통",
          retakeRecommended: false,
          retakeReasons: [],
          source,
          signals: [],
        },
        source === "vision-api"
      );
      expectCovered(trust.sourceLabel);
    }
  });

  it("covers the live camera quality checklist labels", () => {
    // Same shape: app/scan/guide.tsx builds [label, ok] pairs and renders t(label),
    // so these are invisible to a regex over t("…") literals.
    for (const label of ["얼굴", "측정영역", "거리", "밝기", "반사 없음", "피부 선명도", "흔들림 없음"]) {
      expectCovered(label);
    }
  });

  it("covers every mood share-link label in every language", () => {
    for (const lang of ["en", "ja", "zh", "ar"] as const) {
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

  it("covers clinic link labels/notes stored Korean-canonical for every locale", () => {
    for (const lang of ["ko", "en", "ja", "zh", "ar"] as const) {
      for (const link of clinicLinks(lang)) {
        expect(link.label).toMatch(HANGUL); // stored canonical, not pre-translated
        expect(link.note).toMatch(HANGUL);
        expectCovered(link.label);
        expectCovered(link.note);
      }
    }
  });

  it("covers every consumer-page message id in every language", () => {
    const paths = [
      "app/page.tsx",
      "app/scan/page.tsx",
      "app/scan/info-sheet.tsx",
      "app/scan/scan-controls.tsx",
      "app/scan/use-quality-loop.ts",
      "app/survey/page.tsx",
      "app/care/page.tsx",
      "app/checkin/page.tsx",
      "app/components/commerce-disclosure.tsx",
      "app/components/product-card.tsx",
      "app/components/product-compare.tsx",
      "app/components/reengage-optin.tsx",
      "app/components/share-card.tsx",
      "app/privacy/page.tsx",
      "app/report/page.tsx",
      "app/studio/page.tsx",
      "app/unsubscribe/unsubscribe-form.tsx",
      "lib/care.ts",
      "lib/report-trust.ts",
      "lib/recommend.ts",
    ];

    for (const path of paths) {
      const source = readFileSync(resolve(root, path), "utf8");
      const messageIds = [...source.matchAll(/\bt\(\"([^\"\r\n]*[가-힣][^\"\r\n]*)\"/g)].map((match) => match[1]);
      for (const messageId of messageIds) expectCovered(messageId);
    }
  });

  it("covers both feedback save messages composed at render time", () => {
    expectCovered("고마워요. {count}번째 피부 피드백이에요.");
    expectCovered("저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요.");
  });

  it("covers the multiline product rationale composed on the report", () => {
    expectCovered("피부 타입 {type}, 고민 {concerns}, 예산 {budget}을 함께 고려했어요. 이 조건에 가까운 {category} 제품을 최대 세 개 보여드릴게요.");
  });

  it.each(["en", "ja", "zh", "ar"])("contains no duplicate keys in %s", (lang) => {
    const source = readFileSync(resolve(root, `lib/i18n/${lang}.ts`), "utf8");
    const keys = [...source.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((match) => JSON.parse(`"${match[1]}"`) as string);
    const seen = new Set<string>();
    const duplicates = [...new Set(keys.filter((key) => seen.has(key) || !seen.add(key)))];
    expect(duplicates).toEqual([]);
  });
});
