import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const root = resolve(import.meta.dirname, "..");

function pngSize(file: string) {
  const buffer = readFileSync(resolve(root, "public", file));
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("installable PWA manifest", () => {
  it("pins the app identity and portrait scope", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      lang: "en",
      categories: ["beauty", "lifestyle"],
    });
  });

  it("ships exact-size install and maskable PNG icons", () => {
    expect(manifest().icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
      expect.objectContaining({ src: "/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
    ]));
    expect(pngSize("icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("icon-maskable-512.png")).toEqual({ width: 512, height: 512 });
  });
});
