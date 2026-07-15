import { describe, expect, it, vi } from "vitest";
import { openCamera, stopMediaStream } from "@/app/scan/camera-stream";

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

  it("stops every media track", () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopMediaStream({ getTracks: () => tracks } as unknown as MediaStream);
    expect(tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
  });
});
