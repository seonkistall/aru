import { describe, expect, it } from "vitest";
import { AR } from "@/lib/i18n/ar";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { clinicLinks, productSearchLinks } from "@/lib/care";
import { buildCommerceLinks } from "@/lib/commerce";
import { SKUS } from "@/lib/skus";

/**
 * The blind spot that let a dead English field sit in `lib/commerce.ts` for weeks.
 *
 * Cycle 27 swept i18n coverage by reading the Korean literal at every `t("…")` CALL
 * SITE, and it came back clean. `/care` renders `t(link.label)` and `t(link.note)`: the
 * literals are DATA, in `lib/commerce.ts` and `lib/care.ts`, and a call-site sweep
 * cannot see them. Nobody could tell whether a non-Korean user saw English there or
 * Korean, which is why `CommerceLink.noteEn` — an English sentence per merchant, read by
 * no code, test or doc — looked like it might be load-bearing.
 *
 * It was not: every one of these strings resolves in all four dictionaries, which is what
 * this file asserts and what made deleting `noteEn` safe rather than a guess. The rule is
 * the principled one rather than an exception list: a string with no Hangul in it is
 * already language-neutral (`"Global search"` is the only one) and `t()` passing it
 * through unchanged is correct, so only Hangul-bearing strings are required to resolve.
 */

const DICTS: [string, Record<string, string>][] = [["en", EN], ["ja", JA], ["zh", ZH], ["ar", AR]];
const hasHangul = (value: string) => /[가-힣]/.test(value);

/** Every string `/care` puts through `t()` that did not come from a call-site literal. */
function renderedCareCopy(): { where: string; value: string }[] {
  const out: { where: string; value: string }[] = [];
  const add = (where: string, value: string) => void out.push({ where, value });

  for (const link of buildCommerceLinks({ id: "probe", brand: "브랜드", name: "제품" })) {
    add(`buildCommerceLinks[${link.merchant}].label`, link.label);
    add(`buildCommerceLinks[${link.merchant}].note`, link.note);
  }
  // The catalogue as it actually ships, in case a sku ever gets links from elsewhere.
  for (const sku of SKUS) {
    for (const link of productSearchLinks(sku)) {
      add(`productSearchLinks(${sku.id})[${link.merchant}].label`, link.label);
      add(`productSearchLinks(${sku.id})[${link.merchant}].note`, link.note);
    }
  }
  for (const locale of ["ko", "en"] as const) {
    for (const link of clinicLinks(locale)) {
      add(`clinicLinks(${locale})[${link.kind}].label`, link.label);
      add(`clinicLinks(${locale})[${link.kind}].note`, link.note);
    }
  }
  return out;
}

describe("care link copy a non-Korean user sees", () => {
  it("resolves in every dictionary, so nothing falls back to Korean", () => {
    const copy = renderedCareCopy();
    expect(copy.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const { where, value } of copy) {
      if (!hasHangul(value)) continue;
      for (const [lang, dict] of DICTS) {
        if (!(value in dict)) missing.push(`${lang}: ${where} = "${value}"`);
      }
    }
    expect(missing, `care copy that would render as Korean:\n${missing.join("\n")}`).toEqual([]);
  });

  // The other half of the rule, so "no Hangul" cannot quietly grow into "untranslated".
  it("has exactly one language-neutral string, and it is the global search label", () => {
    const neutral = [...new Set(renderedCareCopy().filter((entry) => !hasHangul(entry.value)).map((entry) => entry.value))];
    expect(neutral).toEqual(["Global search"]);
  });

  // What `noteEn` was, stated as an assertion so it cannot come back by accident: a
  // second English copy of a note `t()` already translates is dead weight, not coverage.
  it("carries no second English copy of a note the dictionaries already hold", () => {
    const link = buildCommerceLinks({ id: "probe", brand: "브랜드", name: "제품" })[0];
    expect(Object.keys(link).sort()).toEqual(
      ["href", "kind", "label", "merchant", "note", "partnerReady", "priority", "region"]
    );
    expect(EN[link.note]).toBeTruthy();
  });
});
