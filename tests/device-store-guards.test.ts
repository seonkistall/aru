import { readdirSync, readFileSync } from "node:fs";
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

// Every .ts/.tsx under app/ and lib/, not a hand-kept list: a hand-kept list is exactly the
// "memory of them" the header says not to trust. (Supervisor, cycle 49 review: this used to
// be a fixed array of four files.)
function sourceFiles(dir: string): string[] {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}
const FILES = [...sourceFiles("app"), ...sourceFiles("lib")];

function readSrc(file: string) {
  return readFileSync(resolve(root, file), "utf8");
}

// The code that follows each read of the key, with comment lines dropped, so a guard has
// to be CALLED near the read. (Supervisor, cycle 49 review: the previous check was "the
// file contains the word isSkinReads", which the import line alone satisfies — replacing
// /care's guard with a bare cast still passed.)
//
// Two spellings, because there are two ways to read the store. `sessionGet`
// (`lib/session-store.ts`) is the funnel's reader: it tries `sessionStorage` and falls
// back to an in-memory copy for a browser that refuses site storage. When cycle 69 routed
// /report, /care and /survey through it, the scan case of this test dropped to **0**
// readers and its own `toBeGreaterThan(0)` tripwire caught it — which is what that line is
// for. A value out of the in-memory Map needs the same shape guard as one out of the
// store, so both spellings are enumerated here rather than one.
function windowsAfterReads(src: string, key: "reads" | "scan"): string[] {
  const read = new RegExp(`(?:getItem|sessionGet)\\(DEVICE_DATA_KEY\\.${key}\\)`, "g");
  return [...src.matchAll(read)].map((match) =>
    src
      .slice(match.index, match.index + 800)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n"),
  );
}

describe("every device-store read is shape-guarded", () => {
  it("knows which keys it is about", () => {
    expect(DEVICE_DATA_KEY.reads).toBe("gyeol_reads");
    expect(DEVICE_DATA_KEY.scan).toBe("gyeol_scan");
  });

  it("every read of the reads key is followed by an isSkinReads call", () => {
    const readers = FILES.filter((f) => windowsAfterReads(readSrc(f), "reads").length > 0);
    // If this drops to 0 the test has stopped testing anything — the readers moved.
    expect(readers.length).toBeGreaterThan(0);
    for (const file of readers) {
      for (const window of windowsAfterReads(readSrc(file), "reads")) {
        expect(window, `${file} reads gyeol_reads and must guard it`).toMatch(/\bisSkinReads\(/);
      }
    }
  });

  it("every read of the scan key is followed by an isScanReads or shouldApplyScan call", () => {
    const readers = FILES.filter((f) => windowsAfterReads(readSrc(f), "scan").length > 0);
    expect(readers.length).toBeGreaterThan(0);
    for (const file of readers) {
      for (const window of windowsAfterReads(readSrc(file), "scan")) {
        expect(window, `${file} reads gyeol_scan and must guard it`).toMatch(/\b(isScanReads|shouldApplyScan)\(/);
      }
    }
  });

  it("the localStorage mirror guards both, in lib/last-result.ts", () => {
    const src = readSrc("lib/last-result.ts");
    expect(src).toMatch(/scan: isScanReads\(record\.scan\) \? record\.scan : null/);
    expect(src).toMatch(/reads: isSkinReads\(record\.reads\) \? record\.reads : null/);
  });
});
