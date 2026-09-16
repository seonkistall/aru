import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The denied screen tells the user what to do about a camera that did not start, and
 * `deniedReason` is the only thing that decides which instruction they get. The render
 * chain ends in the 권한 branch as its `else`, so a path that flips to `denied` without
 * setting a reason does not fail loudly — it tells someone who has already granted
 * camera permission to go and grant camera permission, or repeats whatever the previous
 * attempt's reason was, because `startCamera` does not clear it between tries.
 *
 * That is what happened on the stream-attach path: `getUserMedia` had already resolved,
 * so permission was granted, and the attach failure still rendered "카메라 권한이
 * 필요해요." A React render test would need the whole MediaDevices surface stubbed to
 * reach three lines of a `catch`; this reads the source instead, in the same shape as
 * tests/i18n-coverage.test.ts, and it fails on exactly the mistake that shipped.
 *
 * What it is and is not: a source-shape contract, not a dataflow proof. It will fail on
 * a legitimate rewrite of the ternary chain into a lookup map or a switch, and the
 * right response to that is to update the parser here, not to delete the file. The
 * load-bearing assertion is the count — one setDeniedReason per setPhase("denied") —
 * because that is the one a proximity window cannot fake and a refactor cannot shrink
 * its way past.
 */

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "app/scan/page.tsx"), "utf8");
/** Comment-only lines stripped, so a comment naming a call is not read as the call. */
const page = source
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");
const LANGS = ["en", "ja", "zh", "ar"] as const;
const dicts = Object.fromEntries(
  LANGS.map((lang) => [lang, readFileSync(resolve(root, `lib/i18n/${lang}.ts`), "utf8")])
) as Record<(typeof LANGS)[number], string>;

/**
 * reason -> its own copy, parsed from the denied screen's ternary chain.
 *
 * Bounded by the end of that chain rather than by a character count: the block that
 * follows is the camera-paused screen, whose Korean copy a fixed window would sweep up
 * and then fail on for an edit that has nothing to do with this one.
 */
function deniedBranches(): Map<string, string> {
  const start = page.indexOf('phase === "denied" &&');
  expect(start, 'the denied block moved').toBeGreaterThanOrEqual(0);
  const chain = page.slice(start, page.indexOf('phase === "interrupted"', start));
  expect(chain.length, 'the denied block is no longer followed by the interrupted block').toBeGreaterThan(0);
  const branches = [...chain.matchAll(/deniedReason === "([A-Za-z][\w-]*)"\s*\n?\s*\?\s*t\("([^"]+)"\)/g)];
  return new Map(branches.map(([, reason, copy]) => [reason, copy]));
}

/** The reasons the state variable is declared to hold. */
function declaredReasons(): string[] {
  const match = page.match(/const \[deniedReason, setDeniedReason\] = useState<([^>]+)>/);
  expect(match, "the deniedReason useState declaration moved").toBeTruthy();
  const reasons = [...(match?.[1] ?? "").matchAll(/"([A-Za-z][\w-]*)"/g)].map(([, reason]) => reason);
  // Without this, extracting the union to a named type (useState<DeniedReason>) would
  // return [] and make every test that iterates it pass by having nothing to iterate.
  expect(
    reasons.length,
    "no reason literals in the useState type argument — if the union moved to a named type, parse it from there"
  ).toBeGreaterThan(1);
  return reasons;
}

describe("the denied screen names the reason it was reached for", () => {
  it("sets exactly one reason per setPhase(\"denied\")", () => {
    // Counting is the load-bearing assertion: a proximity window alone can be
    // satisfied by the PREVIOUS path's setDeniedReason if the code between them
    // shrinks, and this is a textual check with no dataflow behind it.
    const flips = [...page.matchAll(/setPhase\("denied"\)/g)];
    const sets = [...page.matchAll(/setDeniedReason\(/g)];
    expect(flips.length, "no setPhase(\"denied\") found — the flow moved").toBeGreaterThan(0);
    expect(sets.length, "one setDeniedReason per denied transition, no more and no fewer").toBe(flips.length);
  });

  it("puts each reason next to the transition it belongs to", () => {
    // Order does not matter — React batches both into one render — so the window
    // looks both ways. What it catches is a reason set somewhere unrelated, which
    // the count above cannot see.
    const flips = [...page.matchAll(/setPhase\("denied"\)/g)];
    const far = flips
      .map((match) => match.index ?? 0)
      .filter((index) => !page.slice(Math.max(0, index - 200), index + 200).includes("setDeniedReason("))
      .map((index) => page.slice(Math.max(0, index - 160), index + 20).trim());
    expect(far, `${far.length} of ${flips.length} denied transitions have no reason nearby`).toEqual([]);
  });

  it("declares every reason it actually sets", () => {
    const set = [...page.matchAll(/setDeniedReason\("([A-Za-z][\w-]*)"\)/g)].map(([, reason]) => reason);
    const declared = new Set(declaredReasons());
    for (const reason of set) expect(declared, `setDeniedReason("${reason}") is not in the union`).toContain(reason);
  });

  it("renders a distinct string for every reason but the fallback", () => {
    const covered = deniedBranches();
    // One reason is the else-branch and needs no test of its own; every other reason
    // the code can set must have its own branch, or it silently renders that fallback.
    const missing = declaredReasons().filter((reason) => !covered.has(reason));
    expect(missing.length, `reasons with no branch of their own: ${missing.join(", ")}`).toBeLessThanOrEqual(1);
    expect(new Set(covered.values()).size, "two reasons share one string").toBe(covered.size);
  });

  it("gives the new attach copy a real translation in all four dictionaries", () => {
    // tests/i18n-coverage.test.ts already walks every t("…") literal in this file and
    // checks the value is not Hangul, so this only pins the one string this screen
    // gained — by value, not by key presence, which a copied-through Korean entry
    // would satisfy.
    const attach = deniedBranches().get("attach");
    expect(attach, 'the attach branch has no copy of its own').toBeTruthy();
    for (const lang of LANGS) {
      const match = dicts[lang].match(new RegExp(`"${attach}":\\s*"([^"]+)"`));
      expect(match, `"${attach}" missing from the ${lang} dictionary`).toBeTruthy();
      expect(/[가-힣]/.test(match?.[1] ?? ""), `the ${lang} entry is still Korean`).toBe(false);
    }
  });

  it("can render every camera_blocked reason that lands on this screen", () => {
    // Read out of the page's own recordFunnelEvent calls rather than out of the
    // comment in lib/funnel.ts, so this tracks the code and survives a rewrap.
    // "unsupported" is excluded because it has its own phase, not the denied screen —
    // the literal below is what makes that exclusion explicit rather than assumed.
    const recorded = new Set(
      [...page.matchAll(/recordFunnelEvent\("camera_blocked",\s*\{\s*reason:\s*"([A-Za-z][\w-]*)"/g)].map(([, r]) => r)
    );
    const fromVariable = /recordFunnelEvent\("camera_blocked",\s*\{\s*reason\s*\}/.test(page);
    expect(recorded.size + (fromVariable ? 1 : 0), "no camera_blocked calls found — the flow moved").toBeGreaterThan(1);
    expect(page.includes('setPhase("unsupported")'), "unsupported no longer has its own phase").toBe(true);
    recorded.delete("unsupported");
    const declared = new Set(declaredReasons());
    for (const reason of recorded) {
      expect(declared, `camera_blocked records "${reason}" but the denied screen cannot render it`).toContain(reason);
    }
  });
});
