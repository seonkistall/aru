import { describe, expect, it } from "vitest";
import { createRateLimiter, readBoundedJson } from "@/lib/server/request-guard";

describe("request guard", () => {
  it("rejects a declared oversized body before parsing", async () => {
    const request = new Request("http://localhost", { method: "POST", headers: { "content-length": "101" }, body: "{}" });
    await expect(readBoundedJson(request, 100)).rejects.toMatchObject({ status: 413 });
  });

  it("counts actual UTF-8 bytes when content-length is absent", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ value: "가".repeat(40) }),
    });
    await expect(readBoundedJson(request, 64)).rejects.toMatchObject({ status: 413 });
  });

  it("limits repeated keys inside a window", () => {
    const limit = createRateLimiter({ max: 2, windowMs: 1000, maxKeys: 10 });
    expect(limit("a", 0)).toBe(true);
    expect(limit("a", 1)).toBe(true);
    expect(limit("a", 2)).toBe(false);
    expect(limit("a", 1001)).toBe(true);
  });
});
