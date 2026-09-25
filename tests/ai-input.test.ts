import { describe, expect, it } from "vitest";
import { parseAnalyzeInput, parseReasonInput } from "@/lib/server/ai-input";

describe("AI request validation", () => {
  it("accepts a bounded JPEG data URL", () => {
    // `/9j/` is the base64 of `FF D8 FF`. Until 2026-09-25 this case read `AQID` —
    // bytes `01 02 03`, not an image at all — and passed, which is the hole
    // `tests/llm-route-cost-exposure.regression-24.test.ts` was written around: the
    // route paid a vision model to look at whatever bytes arrived under the label.
    expect(parseAnalyzeInput({ image: "data:image/jpeg;base64,/9j/4AAQSkY=" }).ok).toBe(true);
    expect(parseAnalyzeInput({ image: "data:image/png;base64,iVBORw0KGgoAAA==" }).ok).toBe(true);
  });

  it("rejects bytes that are not the media type they are labelled with", () => {
    expect(parseAnalyzeInput({ image: "data:image/jpeg;base64,AQID" }).ok).toBe(false);
    expect(parseAnalyzeInput({ image: "data:image/jpeg;base64,iVBORw0KGgoAAA==" }).ok).toBe(false);
    expect(parseAnalyzeInput({ image: "data:image/png;base64,/9j/4AAQSkY=" }).ok).toBe(false);
    // The signature has to be at offset 0, not merely present somewhere.
    expect(parseAnalyzeInput({ image: "data:image/jpeg;base64,AAAA/9j/AAAA" }).ok).toBe(false);
  });

  it("rejects unsupported image types and malformed base64", () => {
    expect(parseAnalyzeInput({ image: "data:image/svg+xml;base64,AQID" }).ok).toBe(false);
    expect(parseAnalyzeInput({ image: "data:image/jpeg;base64,***" }).ok).toBe(false);
  });

  it("rejects decoded images over 1.5 MB", () => {
    const image = `data:image/jpeg;base64,${"A".repeat(2_100_000)}`;
    expect(parseAnalyzeInput({ image }).ok).toBe(false);
  });

  it("bounds reason item counts and strings", () => {
    const item = { brand: "b", name: "n", category: "c", type: "t", matched: [], budgetText: "x", freeOf: [], fallback: "f" };
    expect(parseReasonInput({ items: [item] }).ok).toBe(true);
    expect(parseReasonInput({ items: Array(9).fill(item) }).ok).toBe(false);
    expect(parseReasonInput({ items: [{ ...item, name: "x".repeat(201) }] }).ok).toBe(false);
  });
});
