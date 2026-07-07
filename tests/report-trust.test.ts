import { describe, expect, it } from "vitest";
import { buildReportTrust, type ReportTrustInput } from "@/lib/report-trust";

const base: ReportTrustInput = {
  confidence: 0.82,
  confidenceLabel: "높음",
  retakeRecommended: false,
  retakeReasons: [],
  source: "roi-calibrated",
  signals: [
    { label: "빛", ok: true, detail: "빛 충분" },
    { label: "흔들림", ok: true, detail: "흔들림 적음" },
  ],
};

describe("buildReportTrust", () => {
  it("explains when the scan was trusted and applied to recommendations", () => {
    const trust = buildReportTrust(base, true);

    expect(trust.tone).toBe("trusted");
    expect(trust.title).toContain("스캔");
    expect(trust.body).toContain("추천");
    expect(trust.checks).toContain("빛 확인");
    expect(trust.checks).toContain("흔들림 확인");
  });

  it("warns when a scan exists but should stay out of the recommendation", () => {
    const trust = buildReportTrust(
      {
        ...base,
        confidence: 0.44,
        confidenceLabel: "낮음",
        retakeRecommended: true,
        retakeReasons: ["프레임 간 신호가 흔들렸어요"],
      },
      false
    );

    expect(trust.tone).toBe("retake");
    expect(trust.title).toContain("재촬영");
    expect(trust.body).toContain("설문");
    expect(trust.reasons).toEqual(["프레임 간 신호가 흔들렸어요"]);
  });
});
