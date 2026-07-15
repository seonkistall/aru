import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { careSummary } from "@/lib/care";
import type { Survey } from "@/lib/recommend";
import type { SkinReads } from "@/lib/skin";
import { budgetBand, SKUS } from "@/lib/skus";

const root = resolve(import.meta.dirname, "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const survey: Survey = {
  type: "복합성",
  concerns: [],
  budget: 29000,
  avoid: [],
  category: "세럼",
};

describe("verifiable product claims", () => {
  it("keeps seed prices internal and does not ship seeded ratings or review counts", () => {
    expect(SKUS.every((sku) => !("rating" in sku) && !("reviewCount" in sku))).toBe(true);

    for (const path of ["app/components/product-card.tsx", "app/components/product-compare.tsx"]) {
      const component = source(path);
      expect(component).not.toMatch(/sku\.rating|reviewCount|toLocaleString|maxRating|minPrice/);
      expect(component).toContain("판매처에서 현재 가격·옵션·성분 확인");
    }
  });

  it("describes price only as a stable budget band", () => {
    expect(budgetBand(1800)).toBe("1만원 미만");
    expect(budgetBand(13500)).toBe("1만원대");
    expect(budgetBand(24000)).toBe("2만원대");
    expect(budgetBand(30000)).toBe("3만원대");
    expect(budgetBand(50000)).toBe("4만원 이상");
  });

  it("does not use unverified popularity as a recommendation signal", () => {
    expect(source("lib/recommend.ts")).not.toMatch(/sku\.rating|popularity tiebreak/);
  });

  it("keeps internal partner readiness out of consumer care", () => {
    const carePage = source("app/care/page.tsx");
    expect(carePage).not.toMatch(/partnerReady|partner_ready|제휴 후보/);
  });

  it("does not infer a purchase or product use from a merchant-link click", () => {
    const card = source("app/components/product-card.tsx");
    const report = source("app/report/page.tsx");
    expect(card).not.toContain("recordPurchase");
    expect(report).not.toContain("recordPurchase");
    expect(card).toContain("recordProductUse");
    expect(card).toContain("이 제품을 사용하기 시작했어요");
    expect(source("app/privacy/page.tsx")).toContain("제품 사용 시작을 직접 기록하면 제품 ID·이름·시작 시각");
  });

  it("prioritizes a clinic only for an explicit trouble concern", () => {
    const visibleRedness = { redness: { level: 1 } } as SkinReads;
    expect(careSummary(survey, visibleRedness, null).clinicPriority).toBe(false);
    expect(careSummary({ ...survey, concerns: ["트러블"] }, null, null).clinicPriority).toBe(true);
  });

  it("promises at most three picks instead of an exact count", () => {
    const home = source("app/page.tsx");
    const layout = source("app/layout.tsx");
    expect(home).toContain("너한테 맞는 최대 셋");
    expect(home).not.toContain("너한테 딱 맞는 셋");
    expect(layout).toMatch(/최대 3가지|up to 3/);
    expect(layout).not.toMatch(/picks the 3|K뷰티 3종/);
  });
});
