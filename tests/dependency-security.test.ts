import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

describe("production dependency security", () => {
  it("patches the PostCSS version bundled by Next", () => {
    expect(packageJson.overrides?.postcss).toBe("^8.5.10");
  });
});
