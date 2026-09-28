import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Vitest's default `testTimeout` is 5000ms in Node (its own docs, quoted with URL and
    // sha256 in the cycle 52 entry of docs/AUTOPILOT.md). Three tests in this suite come
    // close enough to that on a loaded container that the CLOCK becomes the assertion, and
    // a timeout reads exactly like a broken measurement. Measured 2026-09-28 (cycle 52) on
    // this 4-core box:
    //
    //   - `npx vitest run --testTimeout=5000` — the default, spelled out — with twelve
    //     busy-loops saturating the box: `Test Files 3 failed | 117 passed (120) / Tests 3
    //     failed | 1086 passed (1089)`, three `Test timed out in 5000ms` and no assertion
    //     failing anywhere. The three are `tests/cheek-clipping-signal.test.ts > ... > puts
    //     the cut below every capture whose published cheek level has moved` (8462ms),
    //     `tests/blemish-plateau-census.test.ts > ... > reports no tie on a frame with real
    //     pixel noise, at any frame size or noise level` (7141ms) and
    //     `tests/ita-guard-decision.test.ts > ... > is never entered by a capture: 121 blue
    //     gains step straight over it` (6489ms).
    //   - The same suite under the same twelve busy-loops with the value below: `Test Files
    //     120 passed (120) / Tests 1089 passed (1089)`, `Duration 87.27s`.
    //   - Idle, from `--reporter=json`, the worst of the three is 2187.3ms; with six
    //     busy-loops it is 4451.1ms.
    //
    // Individual `it(..., { timeout: N })` values still win where a test asks for more
    // (600000 and 120_000 are both already in use) — this raises the floor, it does not
    // touch what any test asserts. A genuinely hung test still fails, within 60s of a suite
    // whose clean idle run takes 23.30s.
    testTimeout: 60_000,
  },
});
