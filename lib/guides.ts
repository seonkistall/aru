/**
 * The two indexable guide pages (`/guide/<category>-for-<skin type>`), built
 * from the product catalogue rather than written by hand.
 *
 * WHY THESE TWO PAIRS. `SKUS` holds 22 products across 8 categories, and the
 * (category, skin type) pair a guide can say something concrete about is the one
 * the catalogue actually covers. Counted from `lib/skus.ts` (the census is
 * pinned in `tests/guides.test.ts`, so it cannot drift silently): 세럼 ×
 * 복합성 is the best-covered pair at 4 SKUs / 10 distinct concerns / 10
 * distinct ingredients; five pairs tie for second at 3 SKUs, and 토너 × 지성
 * wins that tie on concern coverage (7, against 5 for 크림 × 민감성) while
 * being a different category AND a different skin type from the first, so the
 * two pages are not near-duplicates of each other.
 *
 * ENGLISH, FROM THE DICTIONARY. The site server-renders English
 * (`getServerSnapshot()` in `lib/i18n.tsx`), so these pages read the English
 * dictionary DIRECTLY through `enText()` instead of `t()`: `t()` answers from a
 * module singleton that starts at "ko", and the served HTML is the whole point
 * of an indexable page. `enText()` throws on a missing key whose source string
 * contains Hangul (see below for the three that do not), so a catalogue entry
 * added without a translation fails `tests/guides.test.ts` instead of shipping
 * Korean to an English page.
 *
 * NO CLAIMS. Every sentence this module composes is data dropped into a
 * template; `tests/guides.test.ts` runs the authored templates through
 * `efficacyClean()` AND `BANNED_BY_LANG.en`, and pins the exact set of
 * `BANNED_BY_LANG.en` hits in the rendered text, all of which come from
 * catalogue strings that already ship in English on `/report` and `/care`
 * (`app/components/product-card.tsx` renders `t(sku.name)` and
 * `t(sku.highlights)`; EN has "진정": "Soothing").
 */

import { EN } from "./i18n/en";
import { INGREDIENTS, type IngredientRole } from "./ingredients";
import { CONCERN_ROLES, SKUS, type Category, type Concern, type Sku, type SkinType } from "./skus";

const HANGUL = /[가-힣]/;

/**
 * English for a catalogue string.
 *
 * `t()` falls back to the Korean source when a dictionary entry is missing,
 * which is right inside the app and wrong on a page whose whole purpose is to
 * be read in English. So this throws instead — EXCEPT where the source string
 * carries no Hangul at all. Three of the catalogue's strings are like that and
 * are deliberately absent from all four dictionaries, measured rather than
 * assumed: `PHA·LHA`, `LHA` and `SPF50+ PA++++` are missing from `en`, `ja`,
 * `zh` and `ar` alike, because they read the same in every language. A string
 * with Hangul in it and no entry is the real failure — that one ships Korean to
 * an English reader — and that is what throws.
 */
export function enText(korean: string): string {
  const value = EN[korean];
  if (value) return value;
  if (!HANGUL.test(korean)) return korean;
  throw new Error(`No English text for "${korean}"`);
}

export type GuideIngredient = { inci: string; roles: string[] };

export type GuideRow = {
  id: string;
  brand: string;
  name: string;
  price: string;
  volume?: string;
  /** Why this row is on this page — the same grounds `recommend()` scores on. */
  why: string;
  /** The concerns the reason NAMES, capped at 2 the way `reasonFor()` caps them. */
  named: string[];
  listedFor: string[];
  highlights: string[];
  ingredients: GuideIngredient[];
  freeOf: string[];
};

export type GuideLookFor = {
  role: string;
  concerns: string[];
  ingredients: string[];
  /**
   * Both halves are composed HERE, not in JSX. React separates adjacent
   * expressions in the server-rendered markup, so a heading written as
   * `The {category}s ...` came back from the dev server as text that reads
   * "The toner s ARU lists for this skin" once tags are stripped, and the
   * ingredient list ended "Madecassoside ." with the space inside. Both were
   * read off `curl` output before this changed. A crawler is exactly that
   * tag-stripping reader.
   */
  concernLine: string;
  ingredientLine: string;
};

export type Guide = {
  slug: string;
  path: string;
  category: Category;
  skinType: SkinType;
  /** English labels from the dictionary, so the view never translates. */
  categoryLabel: string;
  skinTypeLabel: string;
  h1: string;
  lede: string[];
  /** Composed, for the same served-HTML reason as `GuideLookFor`. */
  lookForHeading: string;
  lookForIntro: string;
  lookFor: GuideLookFor[];
  rowsHeading: string;
  rowsIntro: string;
  rows: GuideRow[];
  priceNote: string;
  handoff: string;
  provenance: string;
  otherGuide: { path: string; label: string };
};

/** Products in the catalogue that are listed for this category AND this skin type. */
export function guideSkus(category: Category, skinType: SkinType): Sku[] {
  return SKUS.filter((sku) => sku.category === category && sku.forTypes.includes(skinType));
}

function englishList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const SPELLED = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Spelled-out count, so a page's own prose cannot disagree with its row count. */
export function spelled(n: number): string {
  return SPELLED[n] ?? String(n);
}

function wonPrice(price: number): string {
  return `₩${price.toLocaleString("en-US")}`;
}

function ingredientsOf(sku: Sku): GuideIngredient[] {
  return sku.ingredientKeys.flatMap((key) => {
    const entry = INGREDIENTS[key];
    if (!entry) return [];
    return [{ inci: entry.inci, roles: entry.roles.map(enText) }];
  });
}

/**
 * The reason line, built on the grounds `scoreSku()` in `lib/recommend.ts`
 * actually scores: the skin type is in `forTypes` (+3), the category matches
 * what was asked for (+2), the product lists the concern (+2 each), and an
 * ingredient carries a role `CONCERN_ROLES` maps to that concern (+1.2 each).
 * A guide has no survey, so budget and avoid-ingredient terms are dropped —
 * a faithful subset, not a different reason. `reasonFor()` names at most two
 * concerns; this keeps that cap.
 */
function whyFor(sku: Sku, category: Category, skinType: SkinType): { why: string; named: string[] } {
  const named = sku.concerns.slice(0, 2).map((concern) => enText(concern));
  const roleHits = sku.concerns.flatMap((concern) => {
    const roles = CONCERN_ROLES[concern] ?? [];
    const carried = sku.ingredientKeys.some((key) =>
      (INGREDIENTS[key]?.roles ?? []).some((role) => roles.includes(role)),
    );
    return carried ? [enText(concern)] : [];
  });
  const head = `Listed as a ${enText(category)} for ${enText(skinType)} skin`;
  const concerns = named.length ? `, and for ${englishList(named)}` : "";
  const tail = roleHits.length
    ? ` Its ingredients carry roles the catalogue ties to ${englishList([...new Set(roleHits)])}.`
    : "";
  return { why: `${head}${concerns}.${tail}`, named };
}

/**
 * "What to look for": the ingredient roles `CONCERN_ROLES` maps the pair's own
 * concerns onto, ordered by how many of those concerns reach each role, then by
 * how many ingredients in these products carry it. Four at most — past that the
 * list stops being a thing to look for.
 */
function lookForOf(skus: Sku[]): GuideLookFor[] {
  const concerns = [...new Set(skus.flatMap((sku) => sku.concerns))];
  const byRole = new Map<IngredientRole, { concerns: Concern[]; ingredients: Set<string> }>();
  for (const concern of concerns) {
    for (const role of CONCERN_ROLES[concern] ?? []) {
      const entry = byRole.get(role) ?? { concerns: [], ingredients: new Set<string>() };
      entry.concerns.push(concern);
      byRole.set(role, entry);
    }
  }
  for (const sku of skus) {
    for (const key of sku.ingredientKeys) {
      const entry = INGREDIENTS[key];
      if (!entry) continue;
      for (const role of entry.roles) byRole.get(role)?.ingredients.add(entry.inci);
    }
  }
  return [...byRole.entries()]
    .filter(([, entry]) => entry.ingredients.size > 0)
    .sort((a, b) => b[1].concerns.length - a[1].concerns.length || b[1].ingredients.size - a[1].ingredients.size)
    .slice(0, 4)
    .map(([role, entry]) => {
      const concerns = entry.concerns.map((concern) => enText(concern));
      const ingredients = [...entry.ingredients];
      return {
        role: enText(role),
        concerns,
        ingredients,
        concernLine: `for ${englishList(concerns).toLowerCase()}.`,
        ingredientLine: `Carried here by ${englishList(ingredients)}.`,
      };
    });
}

type GuideSeed = {
  slug: string;
  category: Category;
  skinType: SkinType;
  h1: string;
  lede: (rows: Sku[]) => string[];
  otherSlug: string;
  otherLabel: string;
};

const SEEDS: GuideSeed[] = [
  {
    slug: "serum-for-combination-skin",
    category: "세럼",
    skinType: "복합성",
    h1: "Serums for combination skin",
    lede: (rows) => [
      "Combination skin is shiny in some zones and tight in others on the same day, so one serum is being asked to sit comfortably on both.",
      `ARU's catalogue lists ${spelled(rows.length)} serums for combination skin. This page says what each one is listed for and which ingredient roles it carries, so you can see why a pick is a pick before you take a photo of anything.`,
    ],
    otherSlug: "toner-for-oily-skin",
    otherLabel: "Toners for oily skin",
  },
  {
    slug: "toner-for-oily-skin",
    category: "토너",
    skinType: "지성",
    h1: "Toners for oily skin",
    lede: (rows) => [
      "Oily skin usually shows up as shine through the day and pores you can see in a mirror, and toner is the step most routines reach for straight after cleansing.",
      `ARU's catalogue lists ${spelled(rows.length)} toners for oily skin, ${spelled(rows.filter((sku) => sku.freeOf.includes("알코올")).length)} of them alcohol-free. This page says what each one is listed for and which ingredient roles it carries.`,
    ],
    otherSlug: "serum-for-combination-skin",
    otherLabel: "Serums for combination skin",
  },
];

export function guidePath(slug: string): string {
  return `/guide/${slug}`;
}

function buildGuide(seed: GuideSeed): Guide {
  const skus = guideSkus(seed.category, seed.skinType);
  const category = enText(seed.category);
  const skinType = enText(seed.skinType);
  return {
    slug: seed.slug,
    path: guidePath(seed.slug),
    category: seed.category,
    skinType: seed.skinType,
    categoryLabel: category,
    skinTypeLabel: skinType,
    h1: seed.h1,
    lede: seed.lede(skus),
    lookForHeading: `What to look for in a ${category.toLowerCase()}`,
    lookForIntro: `Each row below is an ingredient role from ARU's own ingredient dictionary, the concerns the catalogue ties it to, and the ingredients in these ${spelled(skus.length)} products that carry it.`,
    lookFor: lookForOf(skus),
    rowsHeading: `The ${category.toLowerCase()}s ARU lists for this skin`,
    rowsIntro: `All ${spelled(skus.length)} of them, with the grounds each one is here on. Nothing on this page is ordered by payment: ARU holds no affiliate id and takes no commission today.`,
    rows: skus.map((sku) => ({
      id: sku.id,
      brand: enText(sku.brand),
      name: enText(sku.name),
      price: wonPrice(sku.price),
      volume: sku.volume,
      ...whyFor(sku, seed.category, seed.skinType),
      listedFor: sku.concerns.map((concern) => enText(concern)),
      highlights: sku.highlights.map(enText),
      ingredients: ingredientsOf(sku),
      freeOf: sku.freeOf.map(enText),
    })),
    priceNote: `Prices are the catalogue's own seed values for budget sorting, not live merchant prices, and ${category.toLowerCase()} pricing moves. Check the merchant before you buy anything.`,
    handoff: `Which of these suits you depends on what your skin is doing today, and that is the part a list cannot know. Two ways to narrow it down, both on your own device:`,
    provenance: `Drawn from the ${SKUS.length} products in ARU's catalogue, of which these ${spelled(skus.length)} are the ones listed for both ${category.toLowerCase()} and ${skinType.toLowerCase()} skin. What is described here is cosmetic fit, and nothing more than that.`,
    otherGuide: { path: guidePath(seed.otherSlug), label: seed.otherLabel },
  };
}

export const GUIDES: Guide[] = SEEDS.map(buildGuide);

export function guide(slug: string): Guide {
  const found = GUIDES.find((entry) => entry.slug === slug);
  if (!found) throw new Error(`No guide registered for ${slug}`);
  return found;
}
