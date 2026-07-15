import { describe, expect, it } from "vitest";
import { parseAnalyzeInput, parseReasonInput } from "@/lib/server/ai-input";

describe("AI request validation", () => {
  it("accepts a bounded JPEG data URL", () => {
    expect(parseAnalyzeInput({ image: "data:image/jpeg;base64,AQID" }).ok).toBe(true);
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
