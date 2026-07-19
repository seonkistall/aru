import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("mobile journey layout contract", () => {
  it("puts the primary home action before the process-card list", () => {
    const home = source("app/page.tsx");
    const primaryAction = home.indexOf('data-primary-action="scan"');
    const processCards = home.indexOf("<HowCard");
    expect(primaryAction).toBeGreaterThan(-1);
    expect(processCards).toBeGreaterThan(-1);
    expect(primaryAction).toBeLessThan(processCards);
    expect(home).toContain('clamp(34px, 10vw, 48px)');
    expect(home).toContain("locale-display");
  });

  it("keeps the report commerce action in flow instead of obscuring content", () => {
    const report = source("app/report/page.tsx");
    expect(report).not.toContain('position: "fixed"');
    expect(report).toContain("reportCommerceAction");
    expect(report).toContain('"report_summary"');
  });

  it("collapses alternate care merchants behind an accessible toggle", () => {
    const care = source("app/care/page.tsx");
    expect(care).toContain("links.slice(0, 1)");
    expect(care).toContain("aria-expanded={expanded}");
    expect(care).toContain("다른 판매처 보기");
  });

  it("defines and uses a 44px minimum tap target", () => {
    expect(source("app/globals.css")).toContain("--tap-min: 44px");
    for (const path of ["app/page.tsx", "app/report/page.tsx", "app/care/page.tsx"]) {
      expect(source(path), path).toContain("var(--tap-min)");
    }
    expect(source("app/components/language-switcher.tsx")).toContain('minHeight: "var(--tap-min)"');
    expect(source("app/components/flow-steps.tsx")).toContain('minHeight: "var(--tap-min)"');
    expect(source("app/components/flow-steps.tsx")).toContain('minWidth: "var(--tap-min)"');
    expect(source("app/components/product-card.tsx")).toContain('minHeight: "var(--tap-min)"');
    expect(source("app/components/return-banner.tsx")).toContain('minHeight: "var(--tap-min)"');
    expect(source("app/report/page.tsx")).toContain('<summary style={{ minHeight: "var(--tap-min)"');
    expect(source("app/survey/page.tsx")).toContain('minHeight: "var(--tap-min)"');
    expect(source("app/scan/page.tsx")).toContain('minHeight: "var(--tap-min)"');
    expect(source("app/unsubscribe/unsubscribe-form.tsx")).toContain('minWidth: "var(--tap-min)"');
  });

  it("keeps the camera fallback action at least 44px high", () => {
    const scanStyles = source("app/scan/scan-styles.ts");
    expect(scanStyles).toMatch(
      /export const ghostLink:[\s\S]*?display: "inline-flex"[\s\S]*?minHeight: "var\(--tap-min\)"/,
    );
  });

  it("keeps every reminder opt-in control at least 44px high", () => {
    const reengage = source("app/components/reengage-optin.tsx");
    expect(reengage.match(/minHeight: "var\(--tap-min\)"/g)).toHaveLength(3);
  });

  it("lets studio editor rows shrink without clipping accessible controls", () => {
    const studio = source("app/studio/page.tsx");
    expect(studio).toContain('style={{ ...inputStyle, flex: 1, minWidth: 0 }}');
    expect(studio).toMatch(
      /const presetBtn:[\s\S]*?minHeight: "var\(--tap-min\)"/,
    );
    expect(studio).toMatch(
      /const inputStyle:[\s\S]*?minHeight: "var\(--tap-min\)"/,
    );
    expect(studio).toMatch(
      /function toggleBtn[\s\S]*?minWidth: "var\(--tap-min\)"[\s\S]*?minHeight: "var\(--tap-min\)"/,
    );
  });

  it("bounds the localized hero callout and allows authored wrapping", () => {
    const home = source("app/page.tsx");
    expect(home).toContain('width: "min(240px, calc(100vw - 48px))"');
    expect(home).toContain('whiteSpace: "normal"');
    expect(home).not.toContain('whiteSpace: "nowrap"');
  });

  it("uses a metric-adjusted Korean fallback to avoid display-font layout shifts", () => {
    const css = source("app/globals.css");
    expect(css).toContain('font-family: "ARU Display Fallback"');
    expect(css).toContain("size-adjust: 78%");
    expect(css).toContain('"Nanum Pen Script", "ARU Display Fallback"');
  });
});
