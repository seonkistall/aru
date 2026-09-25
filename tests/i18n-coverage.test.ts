import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { AR } from "@/lib/i18n/ar";
// Dictionaries load per locale in the browser (lib/i18n/core.ts); this test
// switches language synchronously, so it registers all four up front.
import "@/lib/i18n/all";
import { setCurrentLang } from "@/lib/i18n/core";
import { buildReportTrust, type ReportTrustInput } from "@/lib/report-trust";
import { moodSummary } from "@/lib/share-link";
import { clinicLinks } from "@/lib/care";
import { analyzeSkin } from "@/lib/skin";

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

  it("covers both states of every capture signal", () => {
    // Signal labels and details are raw Korean DATA (lib/report-trust.ts matches on the
    // strings), translated at render by app/scan/result-card.tsx via t(). Nothing
    // reached them before: the trust-card cases above pass `signals: []`, so the six
    // strings the three original signals carry are translated because somebody
    // remembered, and the next signal added would have had nothing holding it. An
    // untranslated one shows raw Korean in the 측정 환경 checklist to every non-Korean
    // user. Driven through analyzeSkin rather than asserted from a hand-written list,
    // so a signal added without a fixture here fails the count below instead of
    // silently escaping coverage.
    const W = 200;
    const H = 200;
    const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
    const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];
    const CHIN = [18, 200, 199, 175, 152, 83, 313];
    const frame = (tz: number[], ck: number[], glint?: [number, number, number]) => {
      const data = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y += 1) {
        const base = y < 100 ? tz : ck;
        for (let x = 0; x < W; x += 1) {
          const i = (y * W + x) * 4;
          data[i] = base[0];
          data[i + 1] = base[1];
          data[i + 2] = base[2];
          data[i + 3] = 255;
        }
      }
      if (glint) {
        const [cx, cy, r] = glint;
        for (let y = cy - r; y <= cy + r; y += 1) {
          for (let x = cx - r; x <= cx + r; x += 1) {
            const o = (y * W + x) * 4;
            data[o] = 250;
            data[o + 1] = 250;
            data[o + 2] = 250;
          }
        }
      }
      return { data, width: W, height: H } as unknown as ImageData;
    };
    const marks = (cheekAt: [number, number]) => {
      const lms = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
      for (const i of CHEEKS) lms[i] = { x: cheekAt[0], y: cheekAt[1], z: 0 };
      for (const i of CHIN) lms[i] = { x: 0.5, y: 0.85, z: 0 };
      return lms;
    };
    const SKIN = [196, 152, 140];
    const captures = [
      // all pass; 조명 fails (too dark); 반사 fails (T-zone glint);
      // 노출 여유 fails (cheek red at the ceiling); 피부 영역 fails (patch off-frame).
      analyzeSkin(frame(SKIN, SKIN), marks([0.5, 0.7])),
      analyzeSkin(frame([63, 49, 45], [63, 49, 45]), marks([0.5, 0.7])),
      analyzeSkin(frame(SKIN, SKIN, [100, 60, 6]), marks([0.5, 0.7])),
      analyzeSkin(frame(SKIN, [255, 150, 138]), marks([0.5, 0.7])),
      analyzeSkin(frame(SKIN, SKIN), marks([0.985, 0.985])),
      // 조명 carries THREE details, not two — dark, blown out, and ok — and the blown
      // one needs cheekL over 210 with no channel at the ceiling, or 노출 여유 takes
      // the frame instead. 0.299*230 + 0.587*225 + 0.114*220 = 226.
      analyzeSkin(frame(SKIN, [230, 225, 220]), marks([0.5, 0.7])),
    ];

    const labels = new Set<string>();
    const strings = new Set<string>();
    const failed = new Set<string>();
    for (const reads of captures) {
      expect(reads, "a fixture produced no reading").not.toBeNull();
      for (const signal of reads!.signals) {
        labels.add(signal.label);
        strings.add(signal.label);
        strings.add(signal.detail);
        if (!signal.ok) failed.add(signal.label);
      }
    }
    // Every signal buildSignals defines must have been seen in BOTH states, or the set
    // of details below is short and the case is weaker than it looks.
    expect(failed, `only ${[...failed].join(", ")} were driven to failure`).toEqual(labels);
    // Four labels, plus 조명's three details (dark / blown out / ok) and two each for
    // 반사, 노출 여유 and 피부 영역: 4 + 9 = 13 distinct strings.
    expect(labels.size).toBe(4);
    expect(strings.size, [...strings].join(" | ")).toBe(13);
    for (const msgid of strings) expectCovered(msgid);
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
