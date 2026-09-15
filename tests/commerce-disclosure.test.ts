import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { affiliateDisclosureActive } from "@/lib/commerce";

const root = resolve(import.meta.dirname, "..");
const FLAG = "NEXT_PUBLIC_COMMERCE_AFFILIATE";

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    if (entry.name === "api" || entry.name === "node_modules") continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...tsxFiles(rel));
    else if (entry.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

describe("affiliate disclosure", () => {
  const original = process.env[FLAG];
  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  // The disclosure must state what is true at the time it is read. ARU carries no
  // affiliate id today, so the default has to be the "no commission" wording; a
  // component that always claimed a commission would be its own false statement.
  it("is off unless the deploy turns it on", () => {
    delete process.env[FLAG];
    expect(affiliateDisclosureActive()).toBe(false);
    process.env[FLAG] = "off";
    expect(affiliateDisclosureActive()).toBe(false);
    process.env[FLAG] = "true";
    expect(affiliateDisclosureActive()).toBe(false);
    process.env[FLAG] = "on";
    expect(affiliateDisclosureActive()).toBe(true);
  });

  // 공정위 심사지침 wants the disclosure where the recommendation is, and 올리브영's
  // curator terms withhold the payout when it is missing. A new surface that ships a
  // buy link without it would be invisible in review, so the rule is mechanical.
  it("accompanies every commerce link the app renders", () => {
    const renders = tsxFiles("app").filter((file) => {
      const source = readFileSync(resolve(root, file), "utf8");
      return source.includes("commerceOutHref(") || source.includes("productSearchLinks(");
    });

    expect(renders.length).toBeGreaterThan(0);
    for (const file of renders) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, `${file} renders a commerce link without <CommerceDisclosure />`).toContain("CommerceDisclosure");
    }
  });

  it("carries both wordings in every language", () => {
    const affiliate = "판매처로 이동하는 제휴 링크예요. 구매가 이뤄지면 ARU가 수수료를 받아요. 가격은 달라지지 않아요.";
    const plain = "판매처로 이동하는 링크예요. ARU는 이 링크로 수수료를 받지 않아요.";
    const component = readFileSync(resolve(root, "app/components/commerce-disclosure.tsx"), "utf8");
    expect(component).toContain(affiliate);
    expect(component).toContain(plain);

    for (const lang of ["en", "ja", "zh", "ar"]) {
      const dictionary = readFileSync(resolve(root, `lib/i18n/${lang}.ts`), "utf8");
      expect(dictionary, `${lang} is missing the affiliate wording`).toContain(affiliate);
      expect(dictionary, `${lang} is missing the no-commission wording`).toContain(plain);
    }
  });
});
