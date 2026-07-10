import { t } from "@/lib/i18n/core";

export type CameraAttempt = "high" | "fallback";
export type CropPurpose = "ai-analysis" | "learning-crop" | "model-input";
export type CropPlan = { maxEdge: number; mimeType: "image/jpeg" | "image/png"; quality: number };
export type CropOutputSizeInput = { sourceWidth: number; sourceHeight: number; maxEdge: number };
export type CaptureGateQuality = {
  face: boolean;
  centered: boolean;
  distance: boolean;
  brightness: boolean;
  noGlare: boolean;
  steady: boolean;
};
export type FrameCenter = { x: number; y: number };
export type ScanCaptureLabelInput = {
  phase: "ready" | "analyzing";
  countdown: number | null;
  guideReady: boolean;
  canCapture: boolean;
  zonesReady: boolean;
};

export type CameraQualityDebugInput = {
  attempt: CameraAttempt;
  videoWidth: number;
  videoHeight: number;
  trackSettings?: Partial<MediaTrackSettings>;
  cropSizes?: {
    ai?: string;
    learning?: string;
    model?: string;
  };
};

export function cameraConstraintsForAttempt(attempt: CameraAttempt): MediaStreamConstraints {
  const size = attempt === "high" ? { width: 1080, height: 1440 } : { width: 720, height: 960 };
  return {
    video: {
      facingMode: "user",
      width: { ideal: size.width },
      height: { ideal: size.height },
      frameRate: { ideal: 30 },
    },
    audio: false,
  };
}

export function nextCameraAttempt(attempt: CameraAttempt): CameraAttempt | null {
  return attempt === "high" ? "fallback" : null;
}

export function cropPlanForPurpose(purpose: CropPurpose): CropPlan {
  if (purpose === "ai-analysis") return { maxEdge: 640, mimeType: "image/jpeg", quality: 0.9 };
  if (purpose === "learning-crop") return { maxEdge: 512, mimeType: "image/jpeg", quality: 0.86 };
  return { maxEdge: 224, mimeType: "image/png", quality: 1 };
}

export function cropOutputSize(input: CropOutputSizeInput): { width: number; height: number } {
  const longest = Math.max(input.sourceWidth, input.sourceHeight);
  if (longest <= 0) return { width: 0, height: 0 };
  const scale = input.maxEdge / longest;
  return {
    width: Math.max(1, Math.round(input.sourceWidth * scale)),
    height: Math.max(1, Math.round(input.sourceHeight * scale)),
  };
}

export function captureGatePassed(quality: CaptureGateQuality): boolean {
  return quality.face && quality.centered && quality.distance && quality.brightness && quality.noGlare && quality.steady;
}

export function scanCaptureReady(quality: CaptureGateQuality, zonesReady: boolean): boolean {
  return captureGatePassed(quality) && zonesReady;
}

export function scanCaptureButtonLabel(input: ScanCaptureLabelInput): string {
  if (input.phase === "analyzing") return "분석 중...";
  if (input.countdown !== null) return t("자동 촬영 {n}", { n: input.countdown });
  if (!input.guideReady) return "가이드 준비 중...";
  if (!input.zonesReady) return "측정영역을 맞추는 중...";
  return input.canCapture ? "지금 촬영하기" : "얼굴을 가이드에 맞춰주세요";
}

export function frameMovement(previous: FrameCenter, next: FrameCenter, elapsedMs: number): number {
  return Math.hypot(next.x - previous.x, next.y - previous.y) / Math.max(1, elapsedMs / 250);
}

function idealConstraintValue(value: ConstrainULong | ConstrainDouble | undefined): number | string {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "ideal" in value && value.ideal !== undefined) return value.ideal;
  return "?";
}

export function buildCameraQualityDebug(input: CameraQualityDebugInput): Record<string, string | number | boolean> {
  const requested = cameraConstraintsForAttempt(input.attempt).video as MediaTrackConstraints;
  const track = input.trackSettings ?? {};
  const trackWidth = track.width ?? "?";
  const trackHeight = track.height ?? "?";
  const trackFrameRate = track.frameRate ?? "?";
  const trackFacing = track.facingMode ?? "?";

  return {
    "camera attempt": input.attempt,
    "requested": `${idealConstraintValue(requested.width)}x${idealConstraintValue(requested.height)}@${idealConstraintValue(requested.frameRate)}`,
    "video": `${input.videoWidth}x${input.videoHeight}`,
    "track": `${trackWidth}x${trackHeight}@${trackFrameRate} ${trackFacing}`,
    "crop ai": input.cropSizes?.ai ?? "-",
    "crop learning": input.cropSizes?.learning ?? "-",
    "crop model": input.cropSizes?.model ?? "-",
  };
}
