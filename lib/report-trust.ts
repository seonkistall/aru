import type { AnalysisSource, ConfidenceSignal, SkinReads } from "./skin";

export type ReportTrustTone = "trusted" | "survey-led" | "retake";

export type ReportTrustInput = {
  confidence: number;
  confidenceLabel: SkinReads["confidenceLabel"];
  retakeRecommended: boolean;
  retakeReasons: string[];
  source: AnalysisSource;
  signals: ConfidenceSignal[];
};

export type ReportTrust = {
  tone: ReportTrustTone;
  title: string;
  body: string;
  sourceLabel: string;
  checks: string[];
  reasons: string[];
};

const SOURCE_LABEL: Record<AnalysisSource, string> = {
  "roi-calibrated": "기기에서 확인",
  "vision-api": "기기 확인 + 선택한 AI 분석",
  "ml-model": "기기에서 확인",
};

function signalCheck(signal: ConfidenceSignal): string {
  if (signal.label.includes("빛") || signal.detail.includes("빛")) return signal.ok ? "빛 확인" : "빛 보류";
  if (signal.label.includes("흔들") || signal.detail.includes("흔들")) return signal.ok ? "흔들림 확인" : "흔들림 보류";
  if (signal.label.includes("샘플") || signal.detail.includes("샘플")) return signal.ok ? "피부 샘플 확인" : "피부 샘플 부족";
  return signal.ok ? `${signal.label} 확인` : `${signal.label} 보류`;
}

export function buildReportTrust(reads: ReportTrustInput, scanApplied: boolean): ReportTrust {
  const reasons = reads.retakeReasons.slice(0, 3);
  const checks = Array.from(new Set(reads.signals.slice(0, 4).map(signalCheck)));
  if (reads.retakeRecommended) {
    return {
      tone: "retake",
      title: "사진은 참고만 했어요",
      body: "촬영 조건이 충족되지 않아 설문 답변을 중심으로 정리했어요. 밝은 곳에서 정면으로 다시 촬영하면 피부 특징을 더 선명하게 확인할 수 있어요.",
      sourceLabel: SOURCE_LABEL[reads.source],
      checks,
      reasons,
    };
  }
  if (!scanApplied) {
    return {
      tone: "survey-led",
      title: "설문 답변을 중심으로 정리했어요",
      body: "사진은 참고만 하고, 설문에서 선택한 피부 타입과 고민, 예산을 중심으로 살펴봤어요.",
      sourceLabel: SOURCE_LABEL[reads.source],
      checks,
      reasons,
    };
  }
  return {
    tone: "trusted",
    title: "카메라에서 확인한 피부 특징도 참고했어요",
    body: "사진에서 확인한 특징을 설문 답변과 함께 살펴보고 제품 후보와 루틴을 정리했어요.",
    sourceLabel: SOURCE_LABEL[reads.source],
    checks,
    reasons,
  };
}
