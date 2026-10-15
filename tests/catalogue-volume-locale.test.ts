import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ProductCard } from "@/app/components/product-card";
import { ProductCompare } from "@/app/components/product-compare";
import { recommend, type Survey } from "@/lib/recommend";
import { registerDict, setCurrentLang } from "@/lib/i18n/core";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { AR } from "@/lib/i18n/ar";

/**
 * The mask-pack volume reached every language in Korean.
 *
 * The product card and the compare table rendered `sku.volume` raw, so a visitor in
 * English, Japanese, Chinese or Arabic who picked 마스크팩 saw "1매" beside a translated
 * texture and budget band, although every dictionary already carries "1매". The other
 * volumes ("50ml", "18g") have no entry and t() hands them back unchanged. The Hangul
 * sweep (regression-37) seeds four categories and never 마스크팩, so it did not see it.
 * Found by the cycle 118 bug hunt.
 */
const SURVEY: Survey = { type: "지성", concerns: ["트러블"], budget: 9900, avoid: [], category: "마스크팩" };
const DICTS = { en: [EN, "1 sheet"], ja: [JA, "1枚"], zh: [ZH, "1片"], ar: [AR, "قناع واحد"] } as const;

afterEach(() => setCurrentLang("ko"));

describe("the mask-pack volume", () => {
  const picks = recommend(SURVEY, null).picks;

  it("is a mask pack the survey actually reaches", () => {
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((pick) => pick.sku.volume === "1매")).toBe(true);
  });

  for (const [lang, [dict, volume]] of Object.entries(DICTS)) {
    it(`is translated on the card and in the compare table in ${lang}`, () => {
      registerDict(lang as keyof typeof DICTS, dict);
      setCurrentLang(lang as keyof typeof DICTS);
      const card = renderToStaticMarkup(createElement(ProductCard, { pick: picks[0], placement: "report" }));
      const compare = renderToStaticMarkup(createElement(ProductCompare, { picks }));
      expect(card).toContain(`<span>${volume}</span>`);
      expect(card).not.toContain("1매");
      expect(compare).toContain(volume);
      expect(compare).not.toContain("1매");
    });
  }

  it("still reads 1매 in Korean", () => {
    setCurrentLang("ko");
    expect(renderToStaticMarkup(createElement(ProductCard, { pick: picks[0], placement: "report" }))).toContain("<span>1매</span>");
  });
});
