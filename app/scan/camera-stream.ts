import { cameraConstraintsForAttempt, nextCameraAttempt, type CameraAttempt } from "./camera-quality";

export type CameraInterruptionReason = "muted" | "ended";

function isTerminalCameraError(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError";
}

export async function openCamera(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  let attempt: CameraAttempt | null = "high";
  let lastError: unknown = new Error("camera unavailable");
  while (attempt) {
    try { return { stream: await getUserMedia(cameraConstraintsForAttempt(attempt)), attempt }; }
    catch (error) {
      if (isTerminalCameraError(error)) throw error;
      lastError = error;
      attempt = nextCameraAttempt(attempt);
    }
  }
  throw lastError;
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function watchCameraStream(
  stream: MediaStream,
  onInterrupted: (reason: CameraInterruptionReason) => void,
) {
  let active = true;
  const listeners: Array<{
    track: MediaStreamTrack;
    type: CameraInterruptionReason;
    listener: () => void;
  }> = [];

  for (const track of stream.getVideoTracks()) {
    for (const type of ["muted", "ended"] as const) {
      const eventType = type === "muted" ? "mute" : "ended";
      const listener = () => {
        if (!active) return;
        active = false;
        onInterrupted(type);
      };
      track.addEventListener(eventType, listener);
      listeners.push({ track, type, listener });
    }
  }

  return () => {
    active = false;
    for (const { track, type, listener } of listeners) {
      track.removeEventListener(type === "muted" ? "mute" : "ended", listener);
    }
  };
}
