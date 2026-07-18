import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseManualReengageInput,
  parseSubscribeInput,
  parseUnsubscribeInput,
} from "@/lib/server/reengage-input";

const root = resolve(import.meta.dirname, "..");

describe("re-engagement input validation", () => {
  it("normalizes a valid subscription", () => {
    expect(parseSubscribeInput({ email: "  Person@Example.COM ", consent: true, context: " serum " })).toEqual({
      ok: true,
      value: { email: "person@example.com", consent: true, context: "serum", locale: "ko" },
    });
  });

  it("rejects unknown fields and oversized context", () => {
    expect(parseSubscribeInput({ email: "a@example.com", consent: true, admin: true })).toEqual({ ok: false, reason: "invalid body" });
    expect(parseSubscribeInput({ email: "a@example.com", consent: true, context: "x".repeat(201) })).toEqual({ ok: false, reason: "context too long" });
  });

  it("rejects malformed subscription types and missing consent", () => {
    expect(parseSubscribeInput([])).toEqual({ ok: false, reason: "invalid body" });
    expect(parseSubscribeInput({ email: "a@example.com", consent: true, context: 1 })).toEqual({ ok: false, reason: "invalid body" });
    expect(parseSubscribeInput({ email: "not-an-email", consent: true })).toEqual({ ok: false, reason: "invalid email" });
    expect(parseSubscribeInput({ email: "a@example.com", consent: false })).toEqual({ ok: false, reason: "consent required" });
  });

  it("accepts only a valid email and exact reminder week for manual sends", () => {
    expect(parseManualReengageInput({ email: " A@Example.com ", week: 4 })).toEqual({
      ok: true,
      value: { email: "a@example.com", week: 4, locale: "ko" },
    });
    expect(parseManualReengageInput({ email: "a@example.com", week: 3 })).toEqual({ ok: false, reason: "invalid week" });
    expect(parseManualReengageInput({ email: "a@example.com", week: 2, link: "https://evil.example" })).toEqual({ ok: false, reason: "invalid body" });
  });

  it("accepts only one bounded unsubscribe token", () => {
    expect(parseUnsubscribeInput({ token: "signed-token" })).toEqual({ ok: true, value: { token: "signed-token" } });
    expect(parseUnsubscribeInput({ token: "" })).toEqual({ ok: false, reason: "invalid token" });
    expect(parseUnsubscribeInput({ token: "x".repeat(2049) })).toEqual({ ok: false, reason: "invalid token" });
    expect(parseUnsubscribeInput({ token: "signed-token", email: "a@example.com" })).toEqual({ ok: false, reason: "invalid body" });
  });
});

describe("provider output limits", () => {
  it("caps all AI provider responses at 256 tokens", () => {
    const analyze = readFileSync(resolve(root, "app/api/analyze/route.ts"), "utf8");
    const reason = readFileSync(resolve(root, "app/api/reason/route.ts"), "utf8");

    expect(analyze).toContain("maxOutputTokens: 256");
    expect(analyze).toContain("max_tokens: 256");
    expect(reason).toContain("max_tokens: 256");
  });
});
