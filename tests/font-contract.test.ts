import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function appTsxFiles(dir = resolve(root, "app")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return appTsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("ARU font contract", () => {
  it("self-hosts the Korean display face and defines locale-aware tokens", () => {
    const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
    const css = readFileSync(resolve(root, "app/globals.css"), "utf8");

    expect(layout).toContain('import "@fontsource/nanum-pen-script"');
    expect(css).toContain('--font-hand-ko: "Nanum Pen Script"');
    expect(css).toContain("--font-display: var(--font-hand-ko)");
    expect(css).not.toMatch(/Segoe Print|Comic Sans/);
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("routes display roles through the locale-aware token", () => {
    for (const file of appTsxFiles()) {
      expect(readFileSync(file, "utf8"), file).not.toContain("var(--font-hand)");
    }
  });
});
