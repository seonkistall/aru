import { describe, expect, it } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/server/unsubscribe-token";

describe("unsubscribe tokens", () => {
  it("round-trips a signed email before expiry", () => {
    const token = createUnsubscribeToken("User@example.com", "secret", 2000);
    expect(verifyUnsubscribeToken(token, "secret", 1000)).toEqual({ email: "user@example.com", expiresAt: 2000 });
  });

  it("rejects tampering and expiry", () => {
    const token = createUnsubscribeToken("u@example.com", "secret", 2000);
    expect(verifyUnsubscribeToken(`${token}x`, "secret", 1000)).toBeNull();
    expect(verifyUnsubscribeToken(token, "secret", 2001)).toBeNull();
  });
});
