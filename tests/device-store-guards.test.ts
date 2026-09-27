import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

/**
 * Three cycles fixed one unguarded device-store read each (33, 44, and this one), and each
 * time the next one was found by hand. A `getItem` on a shared store is a promise about
 * shape that JSON.parse does not keep: `/report` renders `reads.oil.value` field by field
 * and `recommend()` indexes `scan.oil` numerically, so a record an older build (or a
 * hand-edited store) left behind either takes the screen or, worse, silently lies —
 * `shouldApplyScan` is a truthiness test plus two optional fields, so `{}` reads as a
 * camera result with no camera behind it.
 *
 * This enumerates the readers instead of trusting a memory of them, so a page added later
 * that reads either key without its guard fails here rather than in a cycle's hand-grep.
 * The last hole it would have caught: `/care` parsed `reads` with no `isSkinReads` for
 * eleven cycles, harmless only because `careSummary` ignores the argument (`lib/care.ts`,
 * the `_reads` warning `npx eslint .` still reports) — i.e. one render away from being the
 * cycle-33 defect again, on the screen that carries the commerce links.
 */

const root = resolve(import.meta.dirname, "..");
const APP_FILES = ["app/report/page.tsx", "app/care/page.tsx", "app/survey/page.tsx", "app/studio/page.tsx"];

function readSrc(file: string) {
  return readFileSync(resolve(root, file), "utf8");
}

// The shape of a read this test recognises, so it cannot be satisfied by a comment.
function readsKey(src: string, key: "reads" | "scan") {
  return new RegExp(`getItem\\(DEVICE_DATA_KEY\\.${key}\\)`).test(src);
}

describe("every device-store read is shape-guarded", () => {
  it("knows which keys it is about", () => {
    expect(DEVICE_DATA_KEY.reads).toBe("gyeol_reads");
    expect(DEVICE_DATA_KEY.scan).toBe("gyeol_scan");
  });

  it("every reader of the reads key names isSkinReads", () => {
    const readers = APP_FILES.filter((f) => readsKey(readSrc(f), "reads"));
    // If this drops to 0 the test has stopped testing anything — the readers moved.
    expect(readers.length).toBeGreaterThan(0);
    for (const file of readers) {
      expect(readSrc(file), `${file} reads gyeol_reads and must guard it`).toContain("isSkinReads");
    }
  });

  it("every reader of the scan key names isScanReads or shouldApplyScan", () => {
    const readers = APP_FILES.filter((f) => readsKey(readSrc(f), "scan"));
    expect(readers.length).toBeGreaterThan(0);
    for (const file of readers) {
      const src = readSrc(file);
      expect(
        src.includes("isScanReads") || src.includes("shouldApplyScan"),
        `${file} reads gyeol_scan and must guard it`,
      ).toBe(true);
    }
  });

  it("the localStorage mirror guards both, in lib/last-result.ts", () => {
    const src = readSrc("lib/last-result.ts");
    expect(src).toMatch(/scan: isScanReads\(record\.scan\) \? record\.scan : null/);
    expect(src).toMatch(/reads: isSkinReads\(record\.reads\) \? record\.reads : null/);
  });
});
