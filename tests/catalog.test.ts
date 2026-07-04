import { describe, expect, it } from "vitest";
import { CONCERN_ROLES, SKUS, type Avoid, type Category, type Concern } from "@/lib/skus";
import { INGREDIENTS } from "@/lib/ingredients";
import { efficacyClean, recommend, type Survey } from "@/lib/recommend";

const CATEGORIES: Category[] = ["클렌저", "토너", "에센스", "세럼", "크림", "선크림", "마스크팩", "아이크림"];
const CONCERNS = Object.keys(CONCERN_ROLES) as Concern[];
const AVOIDS: Avoid[] = ["향료", "알코올", "에센셜오일", "파라벤", "실리콘", "인공색소", "광물성오일"];

describe("catalog compliance (no medical/efficacy claims)", () => {
  it("keeps every product's user-facing copy efficacyClean", () => {
    for (const sku of SKUS) {
      for (const text of [sku.name, ...sku.highlights, ...sku.keyIngredients]) {
        expect(efficacyClean(text).ok, `${sku.id}: "${text}"`).toBe(true);
      }
    }
  });

  it("keeps every ingredient's name/note/roles efficacyClean", () => {
    for (const ing of Object.values(INGREDIENTS)) {
      for (const text of [ing.name, ing.note, ...ing.roles]) {
        expect(efficacyClean(text).ok, `${ing.key}: "${text}"`).toBe(true);
      }
    }
  });
});

describe("catalog coverage (recommendation never dead-ends)", () => {
  it("has at least one product in every survey category", () => {
    for (const category of CATEGORIES) {
      expect(SKUS.filter((s) => s.category === category).length, category).toBeGreaterThan(0);
    }
  });

  it("has at least one product addressing every concern", () => {
    for (const concern of CONCERNS) {
      expect(SKUS.some((s) => s.concerns.includes(concern)), concern).toBe(true);
    }
  });

  it("makes every avoid option satisfiable (no globally-unsatisfiable filter)", () => {
    // The hard bug: an avoid a user can select that NO product honors, so it
    // always relaxes and implies such products are scarce.
    for (const avoid of AVOIDS) {
      expect(SKUS.some((s) => s.freeOf.includes(avoid)), avoid).toBe(true);
    }
  });

  it("honors a silicone/mineral-oil avoid without relaxing in the common categories", () => {
    // The two avoids that were previously uncovered — verify they now resolve to
    // fully-clear picks (avoidedClear) in categories a user is likely to pick.
    for (const category of ["토너", "세럼", "크림"] as Category[]) {
      const result = recommend({ type: "복합성", concerns: [], budget: 60000, avoid: ["실리콘"], category }, null);
      expect(result.picks.some((p) => p.avoidedClear), `실리콘 in ${category}`).toBe(true);
    }
  });

  it("produces ingredient tags and clean copy for a representative survey", () => {
    const survey: Survey = { type: "복합성", concerns: ["모공", "유분", "트러블"], budget: 25000, avoid: ["향료"], category: "세럼" };
    const result = recommend(survey, { oil: 2, redness: 1, pores: 1, confidence: 0.8 });
    expect(result.picks.length).toBeGreaterThan(0);
    for (const pick of result.picks) {
      expect(pick.ingredientTags.length).toBeGreaterThan(0);
      expect(efficacyClean(pick.reason).ok).toBe(true);
      for (const tag of pick.ingredientTags) expect(efficacyClean(`${tag.name} ${tag.role}`).ok).toBe(true);
    }
  });
});
