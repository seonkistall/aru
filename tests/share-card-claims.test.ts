import { describe, expect, it } from "vitest";
// Dictionaries load per locale in the browser (lib/i18n/core.ts); this test switches
// language synchronously, so it registers all four up front.
import "@/lib/i18n/all";
import { LANGS, setCurrentLang, t, type Lang } from "@/lib/i18n/core";
import { efficacyClean } from "@/lib/recommend";
import { BANNED_BY_LANG } from "@/lib/claim-filter";
import { SKIN_LABELS, headlineFor, overallFor, type Bucket, type SkinLevel } from "@/lib/skin";

/**
 * Every string `app/components/share-card.tsx` can rasterize into the shared PNG,
 * in every locale, against both claim gates.
 *
 * The card is the product's only built-in viral surface: the image leaves the device
 * and lands in a chat where nothing downstream filters it. Nothing on this path runs
 * through `reasonClean()` today, because none of it is LLM output — it is authored
 * copy plus `lib/skin.ts` bucket labels. That is exactly why it needs a test rather
 * than a convention: authored copy is edited by hand, and a future edit that reads
 * "reduces oil" would ship into a shareable image with no gate in the way.
 *
 * The enumeration is closed, not sampled. The card renders, in order: the brand word,
 * a hardcoded `skin mood`, the headline, a fixed subtitle, one row per read
 * (label + value), and a fixed footer. The headline is either a `/studio` preset or
 * `headlineFor()`; the values are either a preset value or `SKIN_LABELS` /
 * `overallFor()`. Those five sources are the whole space.
 */

// app/components/share-card.tsx: rendered unconditionally, independent of the read data.
const CARD_CHROME = ["아루", "오늘의 피부 특징을 간단히 정리했어요.", "30초 피부 스캔"];

// share-card.tsx passes these to navigator.share() alongside the PNG, so they are
// part of what a recipient sees even though they are not drawn on the image.
const SHARE_SHEET = ["오늘의 피부 리포트", "친구도 링크에서 30초 만에 자신의 피부를 살펴볼 수 있어요."];

// app/studio/page.tsx PRESETS — the card's content before any scan is loaded.
const PRESET_HEADLINES = ["차분하고\n편안한 결", "윤기가\n도드라지는 결"];
const PRESET_VALUES = ["편안한 편", "균형 조절 필요"];

// app/studio/page.tsx builds the four rows under these labels.
const ROW_LABELS = ["유분", "모공/결", "붉은기", "전반"];

const LEVELS: SkinLevel[] = [0, 1, 2];

function bucket(level: SkinLevel): Bucket {
  return { value: "", level, calm: level === 0, confidence: 0.9 };
}

/** Every headline `headlineFor()` can return, by sweeping its three inputs. */
function everyDerivedHeadline(): string[] {
  const out = new Set<string>();
  for (const oil of LEVELS)
    for (const redness of LEVELS)
      for (const pores of LEVELS) out.add(headlineFor(bucket(oil), bucket(redness), bucket(pores)));
  return [...out];
}

/** Every 전반 value `overallFor()` can return, including the low-confidence branch. */
function everyOverallValue(): string[] {
  const out = new Set<string>();
  for (const confidence of [0.4, 0.9])
    for (const oil of LEVELS)
      for (const redness of LEVELS)
        for (const pores of LEVELS) out.add(overallFor(bucket(oil), bucket(redness), bucket(pores), confidence).value);
  return [...out];
}

const SOURCE_STRINGS = [
  ...CARD_CHROME,
  ...SHARE_SHEET,
  ...PRESET_HEADLINES,
  ...PRESET_VALUES,
  ...ROW_LABELS,
  ...everyDerivedHeadline(),
  ...everyOverallValue(),
  ...SKIN_LABELS.oil,
  ...SKIN_LABELS.redness,
  ...SKIN_LABELS.pores,
];

const LANG_CODES: Lang[] = LANGS.map((l) => l.code);

/**
 * The card's one string that the per-language claim lists already reject, pinned as
 * measured rather than asserted away. It is NOT a regression this cycle and NOT
 * fixable from here: the Korean source `오늘은 진정 루틴이 먼저예요` (`headlineFor()`,
 * redness level 2) passes `efficacyClean()`, because 진정 is not on the Korean list —
 * but `BANNED_BY_LANG.en` bans `sooth(e|es|ed|ing)` and `BANNED_BY_LANG.zh` bans 舒缓,
 * which is what the en and zh dictionaries translate it to. `ja` (鎮静) and `ar`
 * (التهدئة) are clean, so the asymmetry is between the LISTS, not in the copy.
 *
 * Nothing breaks today: the claim gates run only on LLM reason paths
 * (`app/api/reason/route.ts`, `app/api/analyze/route.ts`, `lib/recommend.ts`), and an
 * authored headline never passes through them. It is recorded because the same string
 * also renders on `/report` and `/scan`, and because the card is where it leaves the
 * device — so whichever way the owner resolves the asymmetry has to account for it.
 *
 * The point of pinning the exact array is that a SECOND hit cannot arrive unnoticed:
 * this test fails on a new one, and equally fails if the owner cleans this one up
 * without updating the pin.
 */
const KNOWN_BANNED_HITS: Record<string, string[]> = {
  en: ["Today, soothing comes first"],
  ja: [],
  zh: ["今天舒缓优先"],
  ar: [],
};

describe("share card claim gates", () => {
  it("enumerates a closed, non-trivial string set", () => {
    // Guards the sweep itself: if a refactor empties one of the five sources the
    // assertions below would pass by having nothing to check.
    expect(everyDerivedHeadline()).toHaveLength(5);
    expect(everyOverallValue()).toHaveLength(3);
    expect(new Set(SOURCE_STRINGS).size).toBe(30);
  });

  for (const lang of LANG_CODES) {
    it(`passes efficacyClean() in ${lang}`, () => {
      setCurrentLang(lang);
      const flagged = SOURCE_STRINGS.map((s) => ({ s, r: efficacyClean(t(s)) })).filter((x) => !x.r.ok);
      expect(flagged.map((x) => `${t(x.s)} -> ${x.r.flagged.join(",")}`)).toEqual([]);
    });

    it(`hits BANNED_BY_LANG in ${lang} exactly where it already does`, () => {
      setCurrentLang(lang);
      const banned = BANNED_BY_LANG[lang];
      // ko has no BANNED_BY_LANG entry — efficacyClean() is the Korean list.
      if (!banned) {
        expect(lang).toBe("ko");
        return;
      }
      const hits = SOURCE_STRINGS.map((s) => t(s)).filter((s) => banned.test(s));
      expect(hits).toEqual(KNOWN_BANNED_HITS[lang]);
    });
  }

  it("carries the brand word in a Latin form outside Korean", () => {
    // The only thing on the card a recipient could search for: the card draws no URL
    // and no domain, so if this rendered as Hangul in `en`/`ja`/`zh`/`ar` the image
    // would name the product in a script its own reader cannot type.
    for (const lang of LANG_CODES.filter((l) => l !== "ko")) {
      setCurrentLang(lang);
      expect(t("아루")).toBe("ARU");
    }
    setCurrentLang("ko");
    expect(t("아루")).toBe("아루");
  });

  it("leaves no Hangul in any non-Korean locale", () => {
    for (const lang of LANG_CODES.filter((l) => l !== "ko")) {
      setCurrentLang(lang);
      const leaks = SOURCE_STRINGS.filter((s) => /[가-힣]/.test(t(s)));
      expect(leaks).toEqual([]);
    }
  });
});
