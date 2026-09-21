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
    // /checkin was the one consumer page absent from this list, and that is how its seven
    // answer pills shipped at 35.5px. Both dimensions, because the single-glyph answers
    // (zh 好, ar لا) were narrow as well as short. The pixel measurement is in
    // tests/e2e/checkin-touch-target.regression-1.spec.ts; this is the cheap half.
    expect(source("app/checkin/page.tsx")).toContain('minHeight: "var(--tap-min)"');
    expect(source("app/checkin/page.tsx")).toContain('minWidth: "var(--tap-min)"');
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

  it("lets the camera quality checklist wrap instead of clipping its localized labels", () => {
    const guide = source("app/scan/guide.tsx");
    // One track per check is what broke it: six cells in the 320px content box of a
    // 360px phone is 47px each, and every label longer than that was cut in half.
    // Measured in chromium at 360px on 2026-09-20 — 20 of 30 label cells clipped,
    // every locale — and re-measured after this change at 0 of 30. The write-up with
    // both tables is docs/scan-quality-checklist-layout.md.
    expect(guide).not.toContain("gridTemplateColumns: `repeat(${checks.length}, 1fr)`");
    expect(guide).toContain('gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))"');
    // And the cell must not clip. `overflow: hidden` is the other half of the defect:
    // it zeroes a grid item's automatic minimum size, so the 1fr tracks were free to
    // shrink below min-content instead of widening the grid.
    //
    // Sliced to the ONE line that carries the cell's style, not to the function, and
    // not to the file. Both spellings appear elsewhere in app/scan/guide.tsx — on the
    // zone badge at line 223, and inside the comment that explains this very fix — so
    // a check over any wider slice passes or fails on prose instead of on code. That
    // is the cycle-20 failure mode: a guard that reads a docstring is a false negative
    // and looks exactly like coverage.
    const cellStyle = guide
      .split("\n")
      .find((line) => line.includes("{checks.map") === false && line.includes('borderRadius: 8, padding: "7px 2px"'));
    expect(cellStyle, "the checklist cell's style line moved; this case checks nothing").toBeTruthy();
    expect(cellStyle!).not.toContain('whiteSpace: "nowrap"');
    expect(cellStyle!).not.toContain('overflow: "hidden"');
    expect(cellStyle!, "still the checklist cell and not some other 8px-radius box").toContain("fontSize: 11");
    // The floor has to clear the widest label actually rendered. `✓ Capture area` is
    // 80.59px at fontSize 11 in the app's own stack; 96px is the smallest round figure
    // above it that still fits three columns in 320px.
    const floor = /minmax\((\d+)px, 1fr\)/.exec(guide);
    expect(floor, "the checklist no longer declares a track floor").not.toBeNull();
    expect(Number(floor![1]), "too narrow for the widest label measured (80.59px)").toBeGreaterThanOrEqual(84);
  });

  it("uses a metric-adjusted Korean fallback to avoid display-font layout shifts", () => {
    const css = source("app/globals.css");
    expect(css).toContain('font-family: "ARU Display Fallback"');
    expect(css).toContain("size-adjust: 78%");
    expect(css).toContain('"Nanum Pen Script", "ARU Display Fallback"');
  });
});
