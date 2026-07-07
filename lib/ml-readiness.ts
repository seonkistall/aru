export type MlReadinessBand = "calibrate" | "pipeline" | "dry-run" | "train" | "subgroup";

export type MlReadiness = {
  band: MlReadinessBand;
  title: string;
  detail: string;
  nextAction: string;
  minCropsForNextBand: number | null;
};

export function getMlReadiness({
  labels,
  crops,
  participants = 0,
}: {
  labels: number;
  crops: number;
  participants?: number;
}): MlReadiness {
  if (crops > 0 && participants < 5) {
    return {
      band: "calibrate",
      title: "Pilot coverage gate",
      detail: `Only ${participants} participant(s) are linked. Keep collecting before trusting ML metrics.`,
      nextAction: "Use /pilot to link P001-P030 sessions before relying on crop counts or validation scores.",
      minCropsForNextBand: 30,
    };
  }

  if (crops < 30) {
    return {
      band: "calibrate",
      title: "Threshold 보정 단계",
      detail: `학습용 크롭 ${crops}개입니다. CNN 학습보다 gyeol-labels ${labels}개로 휴리스틱 threshold를 먼저 보정해야 합니다.`,
      nextAction: "30명 파일럿을 마치고 ml/calibrate.py로 oil/redness/pores threshold를 재계산하세요.",
      minCropsForNextBand: 30,
    };
  }

  if (crops < 100) {
    return {
      band: "pipeline",
      title: "ML 파이프라인 점검 단계",
      detail: `학습용 크롭 ${crops}개입니다. 성능 판단은 금지하고 데이터 디코딩, 라벨 분포, train script dry-run만 확인합니다.`,
      nextAction: "prepare_crop_dataset.py와 evaluate_dataset.py를 돌려 깨진 크롭, 라벨 불균형, 조명 편향을 잡으세요.",
      minCropsForNextBand: 100,
    };
  }

  if (crops < 300) {
    return {
      band: "dry-run",
      title: "MobileNetV3 dry-run 단계",
      detail: `학습용 크롭 ${crops}개입니다. MobileNetV3-small을 돌릴 수 있지만 제품 탑재 기준은 아닙니다.`,
      nextAction: "confusion matrix를 보고 조명, 피부톤, 기기별 오류가 한쪽으로 몰리는지 확인하세요.",
      minCropsForNextBand: 300,
    };
  }

  if (crops < 500) {
    return {
      band: "train",
      title: "ML v1 학습 후보 단계",
      detail: `학습용 크롭 ${crops}개입니다. 첫 의미 있는 MobileNetV3-small 학습과 ONNX export 후보를 만들 수 있습니다.`,
      nextAction: "휴리스틱 대비 정확도, bad-frame rejection, 피부톤/조명별 편차를 같이 기록하세요.",
      minCropsForNextBand: 500,
    };
  }

  return {
    band: "subgroup",
    title: "Subgroup 평가 단계",
    detail: `학습용 크롭 ${crops}개입니다. 모델 성능보다 subgroup 편차를 줄이는 일이 moat가 됩니다.`,
    nextAction: "피부톤 proxy, 조명, iPhone/Android, 메이크업 유무별 성능 편차를 별도 리포트로 관리하세요.",
    minCropsForNextBand: null,
  };
}
