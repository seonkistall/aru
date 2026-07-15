import { cameraConstraintsForAttempt, nextCameraAttempt, type CameraAttempt } from "./camera-quality";

export async function openCamera(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  let attempt: CameraAttempt | null = "high";
  let lastError: unknown = new Error("camera unavailable");
  while (attempt) {
    try { return { stream: await getUserMedia(cameraConstraintsForAttempt(attempt)), attempt }; }
    catch (error) { lastError = error; attempt = nextCameraAttempt(attempt); }
  }
  throw lastError;
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}
