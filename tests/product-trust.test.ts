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
      expect(component).toContain("현재 가격, 옵션, 전성분은 판매처에서 다시 확인해 주세요.");
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
    expect(card).toContain("사용 시작일을 기록했어요.");
    expect(source("app/privacy/page.tsx")).toContain("제품 사용 시작을 직접 기록하면 제품 ID, 이름과 시작 시각");
  });

  it("prioritizes a clinic only for an explicit trouble concern", () => {
    const visibleRedness = { redness: { level: 1 } } as SkinReads;
    expect(careSummary(survey, visibleRedness, null).clinicPriority).toBe(false);
    expect(careSummary({ ...survey, concerns: ["트러블"] }, null, null).clinicPriority).toBe(true);
  });

  it("promises at most three picks instead of an exact count", () => {
    const home = source("app/page.tsx");
    const layout = source("app/layout.tsx");
    const engine = source("lib/recommend.ts");
    expect(engine.match(/if \(picks\.length >= 3\) break;/g)).toHaveLength(2);
    expect(home).not.toContain("너한테 맞는 최대 셋");
    expect(home).not.toContain("너한테 딱 맞는 셋");
    expect(layout).not.toMatch(/picks the 3|K뷰티 3종/);
  });
});
