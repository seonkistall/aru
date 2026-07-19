import { describe, expect, it, vi } from "vitest";
import { openCamera, stopMediaStream, watchCameraStream } from "@/app/scan/camera-stream";

function videoStreamWith(track: EventTarget) {
  return {
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

describe("camera stream lifecycle", () => {
  it("uses the high resolution attempt first", async () => {
    const stream = {} as MediaStream;
    const get = vi.fn().mockResolvedValue(stream);
    await expect(openCamera(get)).resolves.toEqual({ stream, attempt: "high" });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("falls back once after high resolution fails", async () => {
    const stream = {} as MediaStream;
    const get = vi.fn().mockRejectedValueOnce(new Error("high")).mockResolvedValueOnce(stream);
    await expect(openCamera(get)).resolves.toEqual({ stream, attempt: "fallback" });
  });

  it("rejects after both attempts fail", async () => {
    await expect(openCamera(vi.fn().mockRejectedValue(new Error("denied")))).rejects.toThrow("denied");
  });

  it("does not retry after camera permission is denied", async () => {
    const denied = new DOMException("denied", "NotAllowedError");
    const get = vi.fn().mockRejectedValue(denied);

    await expect(openCamera(get)).rejects.toBe(denied);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("stops every media track", () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopMediaStream({ getTracks: () => tracks } as unknown as MediaStream);
    expect(tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
  });

  it("reports the first muted Safari video track only once", () => {
    const track = new EventTarget();
    const interrupted = vi.fn();
    const dispose = watchCameraStream(videoStreamWith(track), interrupted);

    track.dispatchEvent(new Event("mute"));
    track.dispatchEvent(new Event("ended"));

    expect(interrupted).toHaveBeenCalledOnce();
    expect(interrupted).toHaveBeenCalledWith("muted");
    dispose();
  });

  it("reports an ended Safari video track", () => {
    const track = new EventTarget();
    const interrupted = vi.fn();
    const dispose = watchCameraStream(videoStreamWith(track), interrupted);

    track.dispatchEvent(new Event("ended"));

    expect(interrupted).toHaveBeenCalledWith("ended");
    dispose();
  });

  it("removes Safari track listeners during cleanup", () => {
    const track = new EventTarget();
    const interrupted = vi.fn();
    const dispose = watchCameraStream(videoStreamWith(track), interrupted);

    dispose();
    track.dispatchEvent(new Event("mute"));

    expect(interrupted).not.toHaveBeenCalled();
  });
});
