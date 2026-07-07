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
  "roi-calibrated": "온디바이스 ROI 분석",
  "vision-api": "온디바이스 + 비전 API 교차 확인",
  "ml-model": "온디바이스 ML 분석",
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
      title: "재촬영하면 더 믿을 수 있어요",
      body: "이번 추천은 스캔 신호를 무리하게 쓰지 않고 설문 답변을 중심으로 정리했어요. 빛, 각도, 흔들림을 맞춰 다시 찍으면 리포트와 추천 근거가 더 선명해집니다.",
      sourceLabel: SOURCE_LABEL[reads.source],
      checks,
      reasons,
    };
  }
  if (!scanApplied) {
    return {
      tone: "survey-led",
      title: "스캔은 참고로만 반영했어요",
      body: "카메라 신호가 충분히 단단하지 않아 추천 점수에는 설문에서 고른 피부 타입, 고민, 예산을 더 크게 반영했어요.",
      sourceLabel: SOURCE_LABEL[reads.source],
      checks,
      reasons,
    };
  }
  return {
    tone: "trusted",
    title: "스캔 신호를 추천에 반영했어요",
    body: "촬영 프레임의 피부 신호와 설문 답변을 함께 보고 제품 추천, 루틴, 주의 성분을 연결했어요. 리포트는 의료 판단이 아니라 화장품 선택을 돕는 참고 결과입니다.",
    sourceLabel: SOURCE_LABEL[reads.source],
    checks,
    reasons,
  };
}
