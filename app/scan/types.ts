// Shared types + constants for the scan screen, extracted from page.tsx so the
// camera-gate UI (guide/result/scanning/feedback) and the page controller agree
// on one definition. No behavior here — pure data.

export type Landmark = { x: number; y: number; z?: number };

export type CaptureMode = "balanced" | "texture" | "tone";

export type CaptureProfile = {
  label: string;
  hint: string;
  minBrightness: number;
  maxDarkRatio: number;
  maxHotRatio: number;
  maxMovement: number;
  requiresSteady: boolean;
  /** Minimum raw normalized face size (larger box axis) required to capture —
   * below this the face is too far for reliable skin-texture reads. */
  minFaceSize: number;
};

export type Quality = {
  face: boolean;
  centered: boolean;
  distance: boolean;
  brightness: boolean;
  noGlare: boolean;
  steady: boolean;
  skinReady: boolean;
  score: number;
  message: string;
  centerOffsetX?: number;
  centerOffsetY?: number;
  faceSize?: number;
  brightnessMean?: number;
  darkRatio?: number;
  hotRatio?: number;
  movement?: number;
  rejectReason?: string;
};

export type ZoneRect = { left: number; top: number; width: number; height: number };
export type GuideZones = {
  tzone: ZoneRect;
  leftCheek: ZoneRect;
  rightCheek: ZoneRect;
  contour: Array<{ x: number; y: number }>;
};

export const initialQuality: Quality = {
  face: false,
  centered: false,
  distance: false,
  brightness: false,
  noGlare: false,
  steady: false,
  skinReady: false,
  score: 0,
  message: "얼굴을 윤곽선 안에 맞춰주세요.",
};

export const ANALYSIS_STEPS = ["촬영 프레임 정합", "T존·양볼 신호 추출", "유분·붉은기·결 판정", "신뢰도 교차 검증"];

// A light face outline (subset of the MediaPipe face-oval indices) for the
// tracking dots — enough to read as "locked on", without a dense mesh.
export const FACE_CONTOUR = [10, 297, 284, 389, 454, 361, 397, 379, 152, 150, 172, 132, 234, 162, 54, 67];

export const CAPTURE_MODES: CaptureMode[] = ["balanced", "texture", "tone"];
export const CAPTURE_PROFILES: Record<CaptureMode, CaptureProfile> = {
  balanced: {
    label: "균형",
    hint: "윤곽, 톤, 피부결을 함께 보는 기본 촬영입니다.",
    // Distance/centering now use aspect-independent raw-box + hardcoded
    // advisory tolerances (see measureQuality); only exposure/movement vary.
    minBrightness: 72,
    maxDarkRatio: 0.4,
    maxHotRatio: 0.1,
    maxMovement: 0.05,
    requiresSteady: false,
    minFaceSize: 0.4,
  },
  texture: {
    label: "피부결",
    hint: "모공과 결을 보려고 조금 더 가까이, 더 흔들림 없이 촬영합니다.",
    minBrightness: 80,
    maxDarkRatio: 0.32,
    maxHotRatio: 0.065,
    maxMovement: 0.03,
    requiresSteady: true,
    minFaceSize: 0.48,
  },
  tone: {
    label: "피부톤",
    hint: "톤과 붉은기를 보기 위해 더 부드러운 빛, 더 적은 반사가 필요해요.",
    minBrightness: 82,
    maxDarkRatio: 0.32,
    maxHotRatio: 0.06,
    maxMovement: 0.045,
    requiresSteady: false,
    minFaceSize: 0.42,
  },
};
