import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSubscribeInput } from "@/lib/server/reengage-input";

/**
 * The reminder opt-in let through an address the route always refuses.
 *
 * The form's only check was <input type="email">, whose rule accepts a domain with no
 * dot ("kim@gmail"), while /api/reengage/subscribe requires one and answers 400. The
 * component shows one message for every refusal, "지금은 신청이 어려워요. 잠시 후 다시
 * 시도해 주세요.", so a visitor who dropped ".com" was told to try again later for an
 * address that can never pass, and the sign-up was lost. The input now carries the
 * route's own rule as its pattern, so the browser stops the submit with its native
 * message. Found by the cycle 119 bug hunt.
 *
 * Browsers compile `pattern` as ^(?:…)$ with the v flag; this builds it the same way.
 */
const source = readFileSync(resolve(import.meta.dirname, "../app/components/reengage-optin.tsx"), "utf8");
const attr = source.match(/pattern="([^"]+)"/);
const browserPattern = attr ? new RegExp(`^(?:${attr[1]})$`, "v") : null;

const accepted = (email: string) => parseSubscribeInput({ email, consent: true, context: "x", locale: "ko" }).ok;

describe("the opt-in email field", () => {
  it("has a pattern", () => {
    expect(browserPattern).not.toBeNull();
  });

  it.each(["kim@gmail", "kim@naver", "a@b", "kim@gmail.com", "first.last@naver.co.kr", "x+tag@daum.net"])(
    "agrees with the route on %s",
    (email) => {
      expect(browserPattern!.test(email)).toBe(accepted(email));
    }
  );
});
