import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("consumer page locale ownership", () => {
  it.each([
    "app/care/page.tsx",
    "app/privacy/page.tsx",
    "app/unsubscribe/unsubscribe-form.tsx",
  ])("uses the global language on %s", (path) => {
    const page = source(path);
    expect(page).toContain("useLanguage()");
    expect(page).not.toMatch(/setLocale|useState<\"ko\"\s*\|\s*\"en\"|aria-label=\"English\"/);
  });

  it("contains no hard-coded Korean/English branch in Care or Privacy", () => {
    for (const path of ["app/care/page.tsx", "app/privacy/page.tsx"]) {
      const page = source(path);
      expect(page).not.toContain('locale === "ko"');
      expect(page).not.toContain("pick(");
    }
  });
});
