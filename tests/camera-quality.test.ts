import { describe, expect, test } from "vitest";
import {
  buildCameraQualityDebug,
  cameraConstraintsForAttempt,
  captureGatePassed,
  scanCaptureButtonLabel,
  scanCaptureReady,
  frameMovement,
  cropOutputSize,
  cropPlanForPurpose,
  nextCameraAttempt,
  type CameraAttempt,
} from "../app/scan/camera-quality";

describe("camera quality upgrade helpers", () => {
  test("requests a higher-resolution front camera on the first attempt", () => {
    const constraints = cameraConstraintsForAttempt("high");

    expect(constraints.video).toMatchObject({
      facingMode: "user",
      width: { ideal: 1080 },
      height: { ideal: 1440 },
      frameRate: { ideal: 30 },
    });
  });

  test("falls back to the legacy camera request after a high-res failure", () => {
    const first: CameraAttempt = "high";
    const second = nextCameraAttempt(first);
    expect(second).toBe("fallback");
    if (second === null) throw new Error("unreachable: high must fall back");
    const constraints = cameraConstraintsForAttempt(second);

    expect(constraints.video).toMatchObject({
      facingMode: "user",
      width: { ideal: 720 },
      height: { ideal: 960 },
      frameRate: { ideal: 30 },
    });
  });

  test("uses sharper crops for AI while keeping learning crops storage-aware", () => {
    expect(cropPlanForPurpose("ai-analysis")).toEqual({ maxEdge: 640, mimeType: "image/jpeg", quality: 0.9 });
    expect(cropPlanForPurpose("learning-crop")).toEqual({ maxEdge: 512, mimeType: "image/jpeg", quality: 0.86 });
    expect(cropPlanForPurpose("model-input")).toEqual({ maxEdge: 224, mimeType: "image/png", quality: 1 });
  });

  test("upscales small face crops to the target edge while preserving aspect ratio", () => {
    expect(cropOutputSize({ sourceWidth: 220, sourceHeight: 180, maxEdge: 640 })).toEqual({ width: 640, height: 524 });
  });

  test("downscales large face crops to the target edge while preserving aspect ratio", () => {
    expect(cropOutputSize({ sourceWidth: 1600, sourceHeight: 1200, maxEdge: 640 })).toEqual({ width: 640, height: 480 });
  });

  test("builds debug info from requested attempt, actual video size, track settings, and crop sizes", () => {
    const debug = buildCameraQualityDebug({
      attempt: "high",
      videoWidth: 1080,
      videoHeight: 1440,
      trackSettings: {
        width: 960,
        height: 1280,
        frameRate: 24,
        facingMode: "user",
        deviceId: "abc",
      },
      cropSizes: {
        ai: "640x640",
        learning: "512x512",
        model: "224x224",
      },
    });

    expect(debug).toMatchObject({
      "camera attempt": "high",
      "requested": "1080x1440@30",
      "video": "1080x1440",
      "track": "960x1280@24 user",
      "crop ai": "640x640",
      "crop learning": "512x512",
      "crop model": "224x224",
    });
  });

  test("blocks capture when the face is outside the guide center", () => {
    expect(
      captureGatePassed({
        face: true,
        centered: false,
        distance: true,
        brightness: true,
        noGlare: true,
        steady: true,
        skinReady: true,
      })
    ).toBe(false);
  });

  test("blocks capture when the user is moving in any scan mode", () => {
    expect(
      captureGatePassed({
        face: true,
        centered: true,
        distance: true,
        brightness: true,
        noGlare: true,
        steady: false,
        skinReady: true,
      })
    ).toBe(false);
  });

  test("keeps scan capture disabled until the measurement zones are ready", () => {
    const quality = {
      face: true,
      centered: true,
      distance: true,
      brightness: true,
      noGlare: true,
      steady: true,
      skinReady: true,
    };

    expect(scanCaptureReady(quality, false)).toBe(false);
    expect(scanCaptureReady(quality, true)).toBe(true);
  });

  test("keeps scan capture disabled until the skin regions are ready", () => {
    const quality = {
      face: true,
      centered: true,
      distance: true,
      brightness: true,
      noGlare: true,
      steady: true,
      skinReady: false,
    };

    expect(scanCaptureReady(quality, true)).toBe(false);
    expect(scanCaptureReady({ ...quality, skinReady: true }, true)).toBe(true);
  });

  test("explains the exact scan capture blocker in the primary CTA", () => {
    expect(scanCaptureButtonLabel({ phase: "ready", countdown: null, guideReady: true, canCapture: false, zonesReady: false })).toBe(
      "측정영역을 맞추는 중..."
    );
    expect(scanCaptureButtonLabel({ phase: "ready", countdown: 2, guideReady: true, canCapture: true, zonesReady: true })).toBe("자동 촬영 2");
    expect(scanCaptureButtonLabel({ phase: "analyzing", countdown: null, guideReady: true, canCapture: false, zonesReady: true })).toBe("분석 중...");
  });

  test("normalizes frame-to-frame face movement to a 250ms window", () => {
    expect(frameMovement({ x: 0.5, y: 0.5 }, { x: 0.56, y: 0.5 }, 500)).toBeCloseTo(0.03);
  });
});
