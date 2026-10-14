import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The guide pages said "ARU holds no affiliate id and takes no commission today" as a
 * fixed literal. The disclosure next to every buy link flips with
 * NEXT_PUBLIC_COMMERCE_AFFILIATE (tests/e2e/commerce-switch-on.spec.ts), and
 * docs/commerce-partnership-playbook.md warns that a "no commission" statement left live
 * after the switch is a false statement to users; nothing covered these two indexable
 * pages. Found by the cycle 116 bug hunt.
 */

const ORIGINAL = process.env.NEXT_PUBLIC_COMMERCE_AFFILIATE;

async function guidesWith(flag: string | undefined) {
  vi.resetModules();
  if (flag === undefined) delete process.env.NEXT_PUBLIC_COMMERCE_AFFILIATE;
  else process.env.NEXT_PUBLIC_COMMERCE_AFFILIATE = flag;
  return (await import("@/lib/guides")).GUIDES;
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_COMMERCE_AFFILIATE;
  else process.env.NEXT_PUBLIC_COMMERCE_AFFILIATE = ORIGINAL;
  vi.resetModules();
});

describe("the guide pages' payment sentence", () => {
  it("keeps the no-commission clause while the affiliate switch is off", async () => {
    for (const guide of await guidesWith(undefined)) {
      expect(guide.rowsIntro).toContain("takes no commission today");
    }
  });

  it("drops it, and adds nothing, once the switch is on", async () => {
    const off = await guidesWith(undefined);
    const on = await guidesWith("on");
    expect(on.length).toBe(off.length);
    on.forEach((guide, i) => {
      expect(guide.rowsIntro).not.toMatch(/commission|affiliate/i);
      expect(guide.rowsIntro).toContain("Nothing on this page is ordered by payment.");
      expect(off[i].rowsIntro.startsWith(guide.rowsIntro.slice(0, -1))).toBe(true);
    });
  });
});
