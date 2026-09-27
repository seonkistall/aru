import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANNED_BY_LANG } from "@/lib/claim-filter";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { AR } from "@/lib/i18n/ar";
import { INGREDIENTS } from "@/lib/ingredients";
import { GUIDES, enText, guide, guidePath, guideSkus, spelled, type Guide } from "@/lib/guides";
import { efficacyClean } from "@/lib/recommend";
import { SEO_ROUTES, seoRoute } from "@/lib/seo";
import { SKUS, type Category, type SkinType } from "@/lib/skus";

/**
 * Cycle 46, acquisition. Two indexable guide pages built from the catalogue,
 * shipped as a search experiment with a kill criterion (docs/AUTOPILOT.md,
 * Backlog > Now). This file pins the three things a doc sentence cannot keep
 * true: that the pair choice is the coverage census it claims to be, that no
 * sentence on either page makes a claim, and that the landing link, the route
 * table and the pages cannot drift apart.
 */

/**
 * Every string either page puts in front of a reader, composed the way
 * `app/guide/guide-view.tsx` composes it — including the `.toLowerCase()` calls,
 * because a banned word is a banned word in either case.
 */
function guideText(entry: Guide): string[] {
  return [
    entry.h1,
    ...entry.lede,
    entry.lookForHeading,
    entry.lookForIntro,
    ...entry.lookFor.flatMap((look) => [`${look.role} — ${look.concernLine}`, look.ingredientLine]),
    entry.rowsHeading,
    entry.rowsIntro,
    ...entry.rows.flatMap((row) => [
      row.brand,
      row.name,
      row.volume ? `${row.price} · ${row.volume}` : row.price,
      row.why,
      row.listedFor.join(", "),
      row.ingredients.map((ing) => `${ing.inci} (${ing.roles.join(", ").toLowerCase()})`).join("; "),
      row.highlights.join(", "),
      row.freeOf.join(", "),
    ]),
    entry.priceNote,
    "Which one is yours",
    entry.handoff,
    "Take the 30-second scan →",
    "Or answer three questions instead",
    entry.provenance,
    `Another guide: ${entry.otherGuide.label}`,
  ].filter((text) => text.length > 0);
}

/**
 * The catalogue's own English vocabulary, as it already ships on `/report` and
 * `/care`: `app/components/product-card.tsx` renders `t(sku.brand)`,
 * `t(sku.name)` and `t(sku.highlights)`, and `lib/recommend.ts` renders the
 * ingredient roles as tags. Anything a guide page says that is NOT in here was
 * authored in `lib/guides.ts` and is held to the stricter bar below.
 */
function catalogueVocabulary(): string[] {
  const roles = [...new Set(Object.values(INGREDIENTS).flatMap((ing) => ing.roles))];
  return [
    ...SKUS.flatMap((sku) => [sku.brand, sku.name, ...sku.highlights, ...sku.concerns, ...sku.freeOf, sku.category]),
    ...roles,
    ...Object.values(INGREDIENTS).map((ing) => ing.inci),
  ].map(enText);
}

describe("why these two pairs, and not another", () => {
  const TYPES: SkinType[] = ["지성", "건성", "복합성", "민감성", "중성"];

  it("counts 22 products across 8 categories, which is what makes coverage the constraint", () => {
    expect(SKUS.length).toBe(22);
    expect(new Set(SKUS.map((sku) => sku.category)).size).toBe(8);
  });

  it("puts 세럼 × 복합성 alone at the top on SKU count, concerns and ingredients", () => {
    const census = SKUS.reduce<{ pair: string; skus: number; concerns: number; ingredients: number }[]>((acc, _sku, index, all) => {
      if (index > 0) return acc;
      for (const category of [...new Set(all.map((s) => s.category))] as Category[]) {
        for (const type of TYPES) {
          const matched = guideSkus(category, type);
          acc.push({
            pair: `${category} × ${type}`,
            skus: matched.length,
            concerns: new Set(matched.flatMap((s) => s.concerns)).size,
            ingredients: new Set(matched.flatMap((s) => s.ingredientKeys)).size,
          });
        }
      }
      return acc;
    }, []);
    const best = census.filter((row) => row.skus === Math.max(...census.map((r) => r.skus)));
    expect(best).toEqual([{ pair: "세럼 × 복합성", skus: 4, concerns: 10, ingredients: 10 }]);
  });

  it("picks 토너 × 지성 out of the five-way tie for second, on concern coverage", () => {
    const seconds = [...new Set(SKUS.map((s) => s.category))].flatMap((category) =>
      TYPES.map((type) => ({ category, type, matched: guideSkus(category as Category, type) })),
    ).filter((row) => row.matched.length === 3);
    expect(seconds.map((row) => `${row.category} × ${row.type}`)).toEqual([
      "토너 × 지성",
      "토너 × 복합성",
      "세럼 × 지성",
      "크림 × 민감성",
      "선크림 × 복합성",
    ]);
    const concernsOf = (category: string, type: SkinType) =>
      new Set(guideSkus(category as Category, type).flatMap((s) => s.concerns)).size;
    expect(concernsOf("토너", "지성")).toBe(7);
    expect(concernsOf("크림", "민감성")).toBe(5);
    // Second page must differ from the first in BOTH axes or the two pages are
    // near-duplicates, which is the shape of a doorway page.
    expect(GUIDES[1].category).not.toBe(GUIDES[0].category);
    expect(GUIDES[1].skinType).not.toBe(GUIDES[0].skinType);
  });

  it("builds each page from exactly the SKUs the catalogue lists for that pair", () => {
    expect(GUIDES.map((entry) => [entry.slug, entry.rows.length])).toEqual([
      ["serum-for-combination-skin", 4],
      ["toner-for-oily-skin", 3],
    ]);
    for (const entry of GUIDES) {
      expect(entry.rows.map((row) => row.id)).toEqual(guideSkus(entry.category, entry.skinType).map((sku) => sku.id));
    }
  });
});

/**
 * Measured, not chosen. Both hits are the catalogue's own word for the 진정
 * ingredient role, which `lib/i18n/en.ts` translates as "Soothing": capitalised
 * where the role is a label, lower-cased where the view inlines it into a
 * sentence. The serum page carries both; the toner page carries the label only.
 */
/** Copied from `tests/seo-metadata.test.ts`, which holds the route metadata to it. */
const ENGLISH_CLAIMS = [
  "treat", "cure", "heal", "diagnos", "acne", "dermatolog", "clinical", "prescription",
  "remedy", "therapy", "anti-aging", "antiaging", "whitening", "eliminate", "guaranteed",
  "proven", "medical", "condition", "disease",
];

const EXPECTED_EN_HITS: Record<string, string[]> = {
  "serum-for-combination-skin": ["Soothing", "soothing"],
  "toner-for-oily-skin": ["Soothing", "soothing"],
};

describe("no sentence on either page makes a claim", () => {
  for (const entry of GUIDES) {
    it(`${entry.path} passes efficacyClean on every string it renders`, () => {
      for (const text of guideText(entry)) {
        expect(efficacyClean(text), text).toEqual({ ok: true, flagged: [] });
      }
    });

    /**
     * `BANNED_BY_LANG.en` is the codebase's own English claim list — the gate
     * `reasonClean()` puts LLM output through. These pages are not LLM output,
     * but they are English, so the same list is the right ruler. The hits are
     * pinned rather than asserted absent, because the catalogue's own English
     * already contains one of them ("진정" is "Soothing" in `lib/i18n/en.ts`,
     * and it ships today on `/report` and `/care`). Pinning means a NEW banned
     * word — one this cycle wrote — fails here.
     */
    it(`${entry.path} adds no English claim vocabulary of its own`, () => {
      const pattern = new RegExp(BANNED_BY_LANG.en.source, "gi");
      const hits = [...new Set(guideText(entry).join(" · ").match(pattern) ?? [])].sort();
      expect(hits).toEqual(EXPECTED_EN_HITS[entry.slug]);
      const vocabulary = catalogueVocabulary().join(" · ").toLowerCase();
      for (const hit of hits) expect(vocabulary, hit).toContain(hit.toLowerCase());
    });

    /**
     * The third ruler: the substring list `tests/seo-metadata.test.ts` holds the
     * route metadata to. It matches substrings, not words, so it is pinned the
     * same way — the one hit is `condition` inside `Conditioning`, the English
     * name `lib/i18n/en.ts` gives the 컨디셔닝 ingredient role, which already
     * ships as an ingredient tag on `/report`. `condition` is in that list to
     * stop "skin condition", and an ingredient role is not that.
     */
    it(`${entry.path} hits the metadata claim list only on Conditioning`, () => {
      const text = guideText(entry).join(" · ").toLowerCase();
      expect(ENGLISH_CLAIMS.filter((word) => text.includes(word))).toEqual(["condition"]);
      expect(enText("컨디셔닝")).toBe("Conditioning");
      expect(text).not.toContain("skin condition");
    });

    it(`${entry.path} keeps every authored sentence clean of BANNED_BY_LANG.en`, () => {
      const catalogue = catalogueVocabulary();
      const known = new Set(catalogue);
      const strip = new RegExp(
        catalogue.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "gi",
      );
      const authored = guideText(entry).filter((text) => !known.has(text));
      expect(authored.length).toBeGreaterThan(10);
      for (const text of authored) {
        // Catalogue words reach the reader inside an authored line, and the view
        // lower-cases some of them, so strip case-insensitively before judging
        // what this cycle actually wrote.
        expect(BANNED_BY_LANG.en.test(text.replace(strip, " ")), text).toBe(false);
      }
    });
  }
});

describe("the reason on each row is the one recommend() would give", () => {
  for (const entry of GUIDES) {
    it(`${entry.path} names the skin type and the category on every row`, () => {
      for (const row of entry.rows) {
        expect(row.why).toContain(entry.skinTypeLabel);
        expect(row.why).toContain(entry.categoryLabel);
        expect(row.listedFor.length).toBeGreaterThan(0);
        expect(row.ingredients.length).toBeGreaterThan(0);
      }
    });

    it(`${entry.path} names at most two concerns per row, the cap reasonFor() uses`, () => {
      for (const row of entry.rows) {
        expect(row.named.length).toBeGreaterThan(0);
        expect(row.named.length).toBeLessThanOrEqual(2);
        for (const concern of row.named) expect(row.why).toContain(concern);
        // The cap is a cap, not a coincidence: these rows list more than two.
        expect(row.named).toEqual(row.listedFor.slice(0, 2));
      }
      expect(entry.rows.some((row) => row.listedFor.length > 2)).toBe(true);
    });
  }
});

describe("the route table, the sitemap and the landing link cannot drift", () => {
  it("registers both guides as indexable with their own title and description", () => {
    for (const entry of GUIDES) {
      const route = seoRoute(entry.path);
      expect(route.index).toBe(true);
      expect(route.title).toContain("ARU");
      expect(route.description.length).toBeGreaterThan(60);
    }
    expect(SEO_ROUTES.filter((route) => route.path.startsWith("/guide/"))).toHaveLength(2);
  });

  /** A description that says "four" while the catalogue lists three is a lie a crawler quotes. */
  it("spells the row count in each description and the count is the real one", () => {
    for (const entry of GUIDES) {
      expect(seoRoute(entry.path).description).toContain(spelled(entry.rows.length));
    }
  });

  it("ships a layout per guide route that reads the table", () => {
    for (const entry of GUIDES) {
      expect(readFileSync(`app${entry.path}/layout.tsx`, "utf8")).toContain(`seoMetadata("${entry.path}")`);
    }
  });

  it("links both guides from the landing page, by the path and the heading they actually have", () => {
    const source = readFileSync("app/page.tsx", "utf8");
    for (const entry of GUIDES) {
      expect(source).toContain(`href="${entry.path}"`);
      expect(source).toContain(entry.h1);
    }
  });

  it("cross-links the two pages to each other", () => {
    expect(GUIDES[0].otherGuide.path).toBe(GUIDES[1].path);
    expect(GUIDES[1].otherGuide.path).toBe(GUIDES[0].path);
    expect(GUIDES[0].otherGuide.label).toBe(GUIDES[1].h1);
    expect(GUIDES[1].otherGuide.label).toBe(GUIDES[0].h1);
  });

  it("refuses a slug it does not know, and builds its path from the slug", () => {
    expect(() => guide("nope")).toThrow("No guide registered for nope");
    expect(guidePath("x")).toBe("/guide/x");
  });
});

describe("enText is the reason a missing translation cannot ship", () => {
  it("throws on a Hangul string with no dictionary entry", () => {
    expect(() => enText("존재하지 않는 문구")).toThrow('No English text for "존재하지 않는 문구"');
  });

  it("returns the dictionary's own English for a catalogue string", () => {
    expect(enText("세럼")).toBe("Serum");
    expect(enText("복합성")).toBe("Combination");
  });

  /**
   * The three catalogue strings no dictionary translates, because they read the
   * same in every language. Measured across all four, not just `en`.
   */
  it("passes a Hangul-free string through, and those three really are absent everywhere", () => {
    for (const text of ["PHA·LHA", "LHA", "SPF50+ PA++++"]) {
      expect(enText(text)).toBe(text);
      for (const [lang, dict] of Object.entries({ en: EN, ja: JA, zh: ZH, ar: AR })) {
        expect(dict[text], `${text} in ${lang}`).toBeUndefined();
      }
    }
  });

  /** Every other catalogue string a guide page renders does have English. */
  it("leaves no Hangul in anything either page renders", () => {
    for (const entry of GUIDES) {
      for (const text of guideText(entry)) expect(text, text).not.toMatch(/[가-힣]/);
    }
  });
});
