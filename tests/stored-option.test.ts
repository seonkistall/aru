import { describe, expect, it } from "vitest";
import { storedOption, storedOptions } from "@/lib/stored-option";

// The lists the two screens pass in, as they pass them: /survey's chips come from
// lib/skus.ts's unions, /checkin's satisfaction scale is the 1-based index of a rendered
// option. Nothing here is a copy of a guard — the option list IS the guard.
const CATEGORIES = ["클렌저", "토너", "에센스", "세럼", "크림", "선크림", "마스크팩", "아이크림"];
const BUDGET_WONS = [19000, 29000, 39000, 49000, 999999];
const SAT_VALUES = [1, 2, 3];

describe("storedOption", () => {
  it("returns a member unchanged", () => {
    expect(storedOption(CATEGORIES, "세럼")).toBe("세럼");
    expect(storedOption(BUDGET_WONS, 29000)).toBe(29000);
    expect(storedOption(SAT_VALUES, 3)).toBe(3);
  });

  it("returns null for the shapes a device store can actually hand back", () => {
    // Each of these reached state before the guard: a renamed category, a stale band, a
    // scale that used to run to 5, and the handful of values JSON.parse can produce.
    for (const value of ["앰플", "초지성", "", "세 럼", 1234, 0, -1, 2.5, NaN, Infinity, true, false, null, undefined, {}, [], ["세럼"], "null"]) {
      expect(storedOption(CATEGORIES, value), `${String(value)} is not a category`).toBeNull();
    }
    expect(storedOption(BUDGET_WONS, 1234)).toBeNull();
    expect(storedOption(BUDGET_WONS, "29000"), "a stringified band is not the band").toBeNull();
    for (const value of [0, 4, 7, 2.5, NaN, "2", true]) expect(storedOption(SAT_VALUES, value)).toBeNull();
  });

  it("does not confuse a member with a value that merely coerces to one", () => {
    // `includes` is SameValueZero, not `==`, which is the property this relies on.
    expect(storedOption([1], "1")).toBeNull();
    expect(storedOption([1], true)).toBeNull();
    // The one place SameValueZero is looser than Object.is: `-0` passes as `0` and is
    // returned as it was stored, since the guard returns the VALUE and not the member it
    // matched. Neither option list either screen passes in contains 0, so nothing on the
    // funnel can reach this; it is pinned so a future list that does contain 0 is a
    // deliberate decision.
    expect(Object.is(storedOption([0], -0), -0)).toBe(true);
  });
});

describe("storedOptions", () => {
  it("keeps the members and drops the rest, in the stored order", () => {
    expect(storedOptions(CATEGORIES, ["앰플", "세럼", "토너", "미스트"])).toEqual(["세럼", "토너"]);
  });

  it("returns an empty array for an array with no members, because a cleared list is an answer", () => {
    // /survey's 고민 and 피하고 싶은 성분 are optional: [] must be applied to state, not
    // treated as "nothing stored". Cycle 64's hint rule depends on this distinction.
    expect(storedOptions(CATEGORIES, [])).toEqual([]);
    expect(storedOptions(CATEGORIES, ["앰플"])).toEqual([]);
  });

  it("returns null for anything that is not an array, so state is left as it stands", () => {
    for (const value of ["세럼", 1, 0, true, false, null, undefined, {}, { 0: "세럼", length: 1 }]) {
      expect(storedOptions(CATEGORIES, value), `${String(value)} is not an array`).toBeNull();
    }
  });

  it("drops a nested or repeated non-member without touching the members around it", () => {
    expect(storedOptions(CATEGORIES, ["세럼", null, ["토너"], "세럼", {}, "크림"])).toEqual(["세럼", "세럼", "크림"]);
  });
});
