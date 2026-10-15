import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

/**
 * /ops printed the funnel_events window in UTC beside a local "Read at".
 *
 * `describeWindow` formatted both ends with toISOString().slice(0, 10), the UTC date,
 * while the same panel prints readAt with toLocaleString(). A Seoul operator reading
 * rows written between 00:00 and 08:59 KST saw the previous day's date next to a "Read
 * at" on the right day. Both are now the operator's own calendar day. Found by the
 * cycle 118 bug hunt.
 *
 * The page module may export only what Next.js allows, so the function is taken from
 * the source, transpiled, and run under TZ=Asia/Seoul.
 */
const source = readFileSync(resolve(import.meta.dirname, "../app/ops/page.tsx"), "utf8");
const start = source.indexOf("function describeWindow(");
const end = source.indexOf("\n}\n", start) + 2;
const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const describeWindow = new Function(`${js}; return describeWindow;`)() as (a: number | null, b: number | null) => string;

const originalTz = process.env.TZ;
afterEach(() => {
  // Assigning undefined would leave the string "undefined" behind.
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("the /ops funnel_events window", () => {
  it("reads rows written before 09:00 in Seoul as that Seoul day", () => {
    process.env.TZ = "Asia/Seoul";
    const first = Date.parse("2026-10-15T07:10:00+09:00");
    const last = Date.parse("2026-10-15T08:40:00+09:00");
    expect(describeWindow(first, last)).toBe("2026-10-15");
    expect(new Date(last).toLocaleString("en-US")).toContain("10/15/2026");
  });

  it("keeps the YYYY-MM-DD shape and the arrow for a span", () => {
    process.env.TZ = "Asia/Seoul";
    expect(describeWindow(Date.parse("2026-10-14T23:30:00+09:00"), Date.parse("2026-10-15T00:30:00+09:00"))).toBe("2026-10-14 → 2026-10-15");
    expect(describeWindow(null, null)).toBe("—");
  });
});
