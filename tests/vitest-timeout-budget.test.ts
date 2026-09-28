import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

/**
 * The harness clock is not allowed to be the assertion.
 *
 * Cycle 51 recorded a `npx vitest run` that printed `Test Files 1 failed | 118 passed
 * (119) / Tests 1 failed | 1086 passed (1087)` on a fresh checkout, with nine following
 * runs on the same tree clean and the failing test's name lost to a filter. Cycle 52 ran
 * `npx vitest run` 25 times on that same tree — 6 cold (`node_modules/.vite` and
 * `node_modules/.vitest` removed first), 7 warm, 7 with `--sequence.shuffle`, 2 as two
 * concurrent processes, 2 with `--reporter=json`, and 1 cold under six busy-loops on a
 * 4-core box — and every one printed `Test Files 119 passed (119) / Tests 1087 passed
 * (1087)`. It did not reproduce, so nothing here claims to know which test failed.
 *
 * What it does pin is the one mechanism that produces that signature from a tree with no
 * defect in it. Vitest's `testTimeout` default is 5000ms in Node. Run with that value
 * spelled out (`--testTimeout=5000`) under twelve busy-loops, this suite gives `Test Files
 * 3 failed | 117 passed (120) / Tests 3 failed | 1086 passed (1089)` — three `Test timed
 * out in 5000ms`, no assertion failing anywhere:
 *
 *   tests/cheek-clipping-signal.test.ts  puts the cut below every capture whose published
 *                                        cheek level has moved                     8462ms
 *   tests/blemish-plateau-census.test.ts reports no tie on a frame with real pixel
 *                                        noise, at any frame size or noise level   7141ms
 *   tests/ita-guard-decision.test.ts     is never entered by a capture: 121 blue gains
 *                                        step straight over it                     6489ms
 *
 * The first of those is 2187.3ms idle and 4451.1ms under six busy-loops. On an idle box
 * `--testTimeout=1500` fails exactly two of them (2086ms and 1885ms as reported by that
 * run), and on the 119-file tree `--testTimeout=2000` failed exactly one and printed
 * cycle 51's line back verbatim: `Test Files 1 failed | 118 passed (119) / Tests 1 failed
 * | 1086 passed (1087)`, with `Test timed out in 2000ms`. Under the same twelve busy-loops
 * the value this file guards gives `Test Files 120 passed (120) / Tests 1089 passed
 * (1089)`.
 *
 * Two tests in `tests/cheek-clipping-signal.test.ts` and three in
 * `tests/blemish-perturbation-tolerance.test.ts` already carry an explicit
 * `{ timeout: N }` for exactly this reason, and the comment at
 * `tests/blemish-perturbation-tolerance.test.ts:787` records a case that "went red three
 * times before this line". The config value is that decision made once for the whole suite
 * instead of one test at a time; this guard is what fails if it is dropped.
 */
describe("the vitest testTimeout floor", () => {
  const config = readFileSync(resolve(root, "vitest.config.ts"), "utf8");

  it("is declared, so no test races vitest's 5000ms Node default", () => {
    expect(config).toMatch(/\btestTimeout:\s*[\d_]+\s*,/);
  });

  it("clears the worst duration measured for an un-budgeted test by at least 4x", () => {
    const declared = Number(/\btestTimeout:\s*([\d_]+)\s*,/.exec(config)?.[1].replace(/_/g, ""));
    expect(Number.isFinite(declared)).toBe(true);
    // 4451.1ms is `puts the cut below every capture whose published cheek level has moved`
    // under six busy-loops on this container. 4x is 17804.4ms, so the floor is the round
    // number above that.
    expect(declared).toBeGreaterThanOrEqual(20_000);
    // Not unbounded either: a hung test still has to fail inside a wait comparable to one
    // suite, whose clean idle run takes 23.30s.
    expect(declared).toBeLessThanOrEqual(120_000);
  });
});
