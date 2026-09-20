import { describe, expect, it } from "vitest";
import { MOOD_LABELS, decodeMood, encodeMood, moodShareUrl, moodSummary, readMoodFromHash } from "@/lib/share-link";
import { SKIN_LABELS } from "@/lib/skin";

describe("the share card says the same thing the report said", () => {
  it("uses SKIN_LABELS verbatim for all three axes", () => {
    // lib/share-link.ts copies these instead of importing lib/skin.ts, so that the
    // landing page a shared link opens does not pull the analysis runtime into its
    // bundle. The copy is what drifted: pores[1] read "결 약간" there against
    // "결 약간 보임" in SKIN_LABELS, so the sender's report and the receiver's mood
    // line described the same level with two different words. A test may import both.
    expect(MOOD_LABELS.oil).toEqual(SKIN_LABELS.oil);
    expect(MOOD_LABELS.redness).toEqual(SKIN_LABELS.redness);
    expect(MOOD_LABELS.pores).toEqual(SKIN_LABELS.pores);
  });

  it("renders the drifted level with the wording the report uses", () => {
    expect(moodSummary({ oil: 0, redness: 0, pores: 1 })).toContain("결 약간 보임");
  });
});

describe("mood deep link encode/decode", () => {
  it("round-trips levels through the 3-char code", () => {
    const levels = { oil: 1, redness: 0, pores: 2 };
    expect(encodeMood(levels)).toBe("102");
    expect(decodeMood(encodeMood(levels))).toEqual(levels);
  });

  it("rejects malformed or out-of-range codes", () => {
    expect(decodeMood("12")).toBeNull(); // too short
    expect(decodeMood("1234")).toBeNull(); // too long
    expect(decodeMood("139")).toBeNull(); // level 3 and 9 out of range
    expect(decodeMood("abc")).toBeNull();
    expect(decodeMood(null)).toBeNull();
  });

  it("builds a hash-fragment URL (no query string, no server exposure)", () => {
    const url = moodShareUrl({ oil: 2, redness: 1, pores: 0 }, "https://aru-beauty.vercel.app");
    expect(url).toBe("https://aru-beauty.vercel.app/#m=210");
    expect(url).not.toContain("?"); // hash only, never a query param
  });

  it("reads the mood back out of a location hash", () => {
    expect(readMoodFromHash("#m=210")).toEqual({ oil: 2, redness: 1, pores: 0 });
    expect(readMoodFromHash("#foo=bar&m=012")).toEqual({ oil: 0, redness: 1, pores: 2 });
    expect(readMoodFromHash("")).toBeNull();
    expect(readMoodFromHash("#m=99")).toBeNull();
  });

  it("renders a non-medical mood summary", () => {
    expect(moodSummary({ oil: 0, redness: 0, pores: 0 })).toBe("유분 적음 · 붉은기 낮음 · 결 매끈");
  });
});
