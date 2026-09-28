import { describe, expect, it } from "vitest";
import { recommend, type Survey } from "@/lib/recommend";
import type { Avoid, Category, Concern, SkinType } from "@/lib/skus";

/**
 * Cycle 50 measured the path from `/` to the first merchant link and looked for one step
 * to cut. The cheapest candidate was a required survey field that does not change the
 * picks — three taps of the six are required fields — so this enumerates whether any of
 * them is inert.
 *
 * None is. Holding the other fields and varying one:
 *   budget    changes `recommend().picks` in 120 of 320 combinations
 *   skin type changes them in 184 of 320
 *   category  changes them in 200 of 200
 * (`concerns`, which is optional, changes them in 206 of 400 — measured for scale.)
 *
 * The counts are asserted exactly, not as "greater than zero", because that is the claim
 * the decision rests on: if a catalogue change made budget inert, the count moves and this
 * test says so rather than quietly agreeing. `tests/e2e/first-merchant-link-path.
 * regression-36.spec.ts` is the other half — it pins the path these three taps sit on.
 */

const TYPES: SkinType[] = ["지성", "건성", "복합성", "민감성", "중성"];
const CATEGORIES: Category[] = ["클렌저", "토너", "에센스", "세럼", "크림", "선크림", "마스크팩", "아이크림"];
// The five budget chips' band ceilings, from app/survey/page.tsx's BUDGETS.
const BUDGETS = [19000, 29000, 39000, 49000, 999999];
const CONCERN_SETS: Concern[][] = [[], ["모공"], ["유분", "붉은기"], ["건조", "수분부족", "잡티"]];
const AVOID_SETS: Avoid[][] = [[], ["향료"]];

const picksOf = (survey: Survey) => recommend(survey, null).picks.map((pick) => pick.sku.id).join(",");

const OTHERS: { concerns: Concern[]; avoid: Avoid[] }[] = CONCERN_SETS.flatMap((concerns) =>
  AVOID_SETS.map((avoid) => ({ concerns, avoid })),
);

function sweep(vary: "budget" | "type" | "category" | "concerns"): { moved: number; total: number } {
  let moved = 0;
  let total = 0;
  const run = (build: (value: unknown) => Survey, values: unknown[]) => {
    total += 1;
    if (new Set(values.map((value) => picksOf(build(value)))).size > 1) moved += 1;
  };
  if (vary === "budget") {
    for (const type of TYPES) for (const category of CATEGORIES) for (const rest of OTHERS) {
      run((budget) => ({ type, category, budget: budget as number, ...rest }), BUDGETS);
    }
  } else if (vary === "type") {
    for (const category of CATEGORIES) for (const budget of BUDGETS) for (const rest of OTHERS) {
      run((t) => ({ type: t as SkinType, category, budget, ...rest }), TYPES);
    }
  } else if (vary === "category") {
    for (const type of TYPES) for (const budget of BUDGETS) for (const rest of OTHERS) {
      run((c) => ({ type, category: c as Category, budget, ...rest }), CATEGORIES);
    }
  } else {
    for (const type of TYPES) for (const category of CATEGORIES) for (const budget of BUDGETS) for (const avoid of AVOID_SETS) {
      run((c) => ({ type, category, budget, concerns: c as Concern[], avoid }), CONCERN_SETS);
    }
  }
  return { moved, total };
}

describe("every required survey field moves the picks", () => {
  it("budget changes the picks in 120 of 320 combinations", () => {
    expect(sweep("budget")).toEqual({ moved: 120, total: 320 });
  });

  it("skin type changes the picks in 184 of 320 combinations", () => {
    expect(sweep("type")).toEqual({ moved: 184, total: 320 });
  });

  it("category changes the picks in 200 of 200 combinations", () => {
    expect(sweep("category")).toEqual({ moved: 200, total: 200 });
  });

  it("the optional concerns field changes them in 206 of 400, for scale", () => {
    expect(sweep("concerns")).toEqual({ moved: 206, total: 400 });
  });

  it("none of the three required fields is inert", () => {
    for (const field of ["budget", "type", "category"] as const) {
      const { moved } = sweep(field);
      expect(moved, `${field} never changed the picks, so it could be cut from /survey`).toBeGreaterThan(0);
    }
  });
});
