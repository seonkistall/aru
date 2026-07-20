import { describe, expect, it, vi, afterEach } from "vitest";
import { supportsFlagEmoji } from "@/lib/flag-support";

type Pixels = number[];

function stubCanvas(pixels: Pixels | null) {
  const context = pixels === null ? null : {
    fillStyle: "",
    textBaseline: "",
    font: "",
    fillText: vi.fn(),
    getImageData: () => ({ data: Uint8ClampedArray.from(pixels) }),
  };
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("flag emoji detection", () => {
  it("reports supported when the glyph paints in colour", () => {
    // one transparent pixel, then a coloured one (red flag stripe)
    stubCanvas([0, 0, 0, 0, 220, 40, 40, 255]);
    expect(supportsFlagEmoji()).toBe(true);
  });

  it("reports unsupported when only monochrome letters are painted", () => {
    // regional-indicator letters render in the single fill colour
    stubCanvas([0, 0, 0, 255, 30, 30, 30, 255, 0, 0, 0, 0]);
    expect(supportsFlagEmoji()).toBe(false);
  });

  it("falls back to supported when the canvas is unavailable", () => {
    stubCanvas(null);
    expect(supportsFlagEmoji()).toBe(true);
  });

  it("falls back to supported when canvas access throws", () => {
    vi.stubGlobal("document", { createElement: () => { throw new Error("blocked"); } });
    expect(supportsFlagEmoji()).toBe(true);
  });
});
