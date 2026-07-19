import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("production Content Security Policy", () => {
  // Regression: ISSUE-006 — production exposed script-src 'unsafe-eval'.
  // Found by product QA on 2026-07-19.
  // Report: .gstack/qa-reports/qa-report-aru-local-2026-07-19.md
  it("does not allow eval outside the development runtime", async () => {
    const groups = await nextConfig.headers?.();
    const headers = Object.fromEntries((groups?.[0].headers ?? []).map(({ key, value }) => [key, value]));

    expect(process.env.NODE_ENV).not.toBe("development");
    expect(headers["Content-Security-Policy"]).toContain("'wasm-unsafe-eval'");
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
  });
});
