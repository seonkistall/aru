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

  /**
   * `/[#&]m=([0-2]{3})/` matched a PREFIX of the value, so `#m=2100` rendered the
   * mood for `210` and recorded a `share_landed` — a mangled share URL showing a
   * confident wrong reading rather than nothing. Filed by cycle 72's hunt with the
   * mis-render measured on a production build; fixed here by requiring `&` or the
   * end of the hash after the three digits.
   */
  it("refuses an m value longer than three digits", () => {
    expect(readMoodFromHash("#m=2100")).toBeNull();
    expect(readMoodFromHash("#m=0120")).toBeNull();
    expect(readMoodFromHash("#x=1&m=2100")).toBeNull();
    // Four digits are refused even when the extra one is outside 0-2, which the old
    // pattern also let through: it stopped reading after the third digit.
    expect(readMoodFromHash("#m=2109")).toBeNull();
  });

  it("still reads an m followed by another param", () => {
    expect(readMoodFromHash("#m=210&other=1")).toEqual({ oil: 2, redness: 1, pores: 0 });
    expect(readMoodFromHash("#m=210&")).toEqual({ oil: 2, redness: 1, pores: 0 });
  });

  it("keeps every shape that was already valid, and the first m still wins", () => {
    // The three shapes cycle 72 measured as rendering the callout on a production
    // build, plus the bare minimum. A duplicated `m` resolves to the FIRST one
    // because `exec` returns the leftmost match; that is today's behaviour and the
    // fix does not change it.
    expect(readMoodFromHash("#m=000")).toEqual({ oil: 0, redness: 0, pores: 0 });
    expect(readMoodFromHash("#m=222")).toEqual({ oil: 2, redness: 2, pores: 2 });
    expect(readMoodFromHash("#x=1&m=012")).toEqual({ oil: 0, redness: 1, pores: 2 });
    expect(readMoodFromHash("#m=210&m=001")).toEqual({ oil: 2, redness: 1, pores: 0 });
    expect(readMoodFromHash(moodShareUrl({ oil: 1, redness: 2, pores: 0 }, "https://example.test"))).toEqual({
      oil: 1,
      redness: 2,
      pores: 0,
    });
  });

  it("renders a non-medical mood summary", () => {
    expect(moodSummary({ oil: 0, redness: 0, pores: 0 })).toBe("유분 적음 · 붉은기 낮음 · 결 매끈");
  });
});
