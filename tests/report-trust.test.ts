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
    expect(trust.title).toBe("카메라에서 확인한 피부 특징도 참고했어요");
    expect(trust.body).toBe("사진에서 확인한 특징을 설문 답변과 함께 살펴보고 제품 후보와 루틴을 정리했어요.");
    expect(trust.sourceLabel).toBe("기기에서 확인");
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
    expect(trust.title).toBe("사진은 참고만 했어요");
    expect(trust.body).toContain("촬영 조건이 충족되지 않아 설문 답변을 중심으로 정리했어요.");
    expect(trust.reasons).toEqual(["프레임 간 신호가 흔들렸어요"]);
  });

  it("uses calm survey-led language without exposing recommendation scores", () => {
    const trust = buildReportTrust(base, false);

    expect(trust.tone).toBe("survey-led");
    expect(trust.title).toBe("설문 답변을 중심으로 정리했어요");
    expect(trust.body).not.toContain("추천 점수");
    expect(trust.body).not.toContain("신호");
  });
});
