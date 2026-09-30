import { defineConfig } from "@playwright/test";
import {
  SWITCH_ON_BASE_URL,
  SWITCH_ON_ENV,
  SWITCH_ON_HOST,
  SWITCH_ON_PORT,
  SWITCH_ON_SERVER_LOG,
} from "./tests/e2e/support/commerce-switch-on";

const host = "127.0.0.1";
const port = Number(process.env.MOBILE_UI_PORT ?? 3102);
const baseURL = `http://${host}:${port}`;

// A sandboxed runner often has a Chromium already on disk whose build number differs
// from the one @playwright/test pins, and no route to cdn.playwright.dev to fetch the
// pinned one. Without an escape hatch the whole E2E suite fails at browser launch, which
// reads as a red build when nothing in the product is broken. Point this at the browser
// the runner already has. Unset — the normal case, including CI — Playwright resolves
// its own pinned build and nothing changes.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();

// This suite is the gate that decides pushes, so it must not report a result for a tree
// it never loaded. Two ways it did:
//
//  1. `reuseExistingServer: true` hands the whole run to whatever is already listening on
//     this port. Measured here: a dev server warmed on the previous revision of
//     `app/globals.css`, left running, turned a true `4 failed | 4 passed` on
//     `guide-ltr-in-rtl-chrome.regression-34` into `8 passed` — a FALSE GREEN on a tree
//     with the `[data-guide-root]` rule deleted. And a socket that accepts without
//     replying hung the run indefinitely (killed at 468s, no `next dev` ever spawned),
//     because the reuse probe has no timeout of its own. The repo has been bitten by the
//     orphan-server half of this twice already, both times diagnosed and not fixed
//     (`docs/autopilot-changelog.md`: "attached to that dead server and timed out on
//     config.webServer", and a run that read `117 failed | 123 passed` with 0 product
//     defects). Playwright's docs recommend `!process.env.CI` here and say `false` "will
//     throw if an existing process is listening on the port or url". What this container
//     actually does with `false` is spawn the server anyway and surface its failure: the
//     same leftover-server tree that read `8 passed` now stops in 4s with
//     `Error: Process from config.webServer was not able to start. Exit code: 1` above a
//     `listen EADDRINUSE` — a loud, named error either way, which is the point.
//  2. The dev cache under `.next/dev` is gitignored, so it survives branch checkouts and
//     container restarts, and cycle 47 saw the dev server answer an e2e assertion from an
//     older `app/globals.css` out of it. Clearing it costs a cold Turbopack compile,
//     measured on this container at 4930 / 5247 / 6072 ms to the first 200 on `/` against
//     1958 ms warm — against a `timeout` of 120_000 ms, which is why that number is left
//     alone: it already carries ~19.8x headroom over the slowest cold start observed, and
//     the failures above were never a shortage of headroom.
//
// `ARU_REUSE_DEV_SERVER=1` opts back into the fast interactive loop. It is deliberately
// opt-in: a single-spec run is exactly where cycle 47's false result came from, so the
// deterministic path is the default everywhere, not only under `npm run smoke`.
const reuseDevServer = process.env.ARU_REUSE_DEV_SERVER === "1";

// The gate measures a PRODUCTION build, not `next dev`. Dev mode puts machinery into every
// page the suite loads that no visitor ever meets: the dev-tools portal whose shadow-root
// button made a cycle 55 wait resolve on the overlay instead of the page, on-demand route
// compilation on the first hit of each route (inside timed specs), Fast Refresh, and
// dev-mode React. Measured on this container, same tree, 2026-09-29 (cycle 56), one run
// each: `next dev` `300 passed (19.6m)`; `next build` + `next start`
// `4 failed | 296 passed (16.9m)` INCLUDING its own build, and all 4 failures were one
// spec asking for what only dev serves (`discovery-metadata.regression-26`, fixed in the
// same cycle; with the fix in, `300 passed (14.8m)`). So production is the faster of the
// two as well as the honest one, and the build is not extra work: `scripts/smoke-test.mjs` needs a production build anyway for
// its HTTP phase and now uses the one made here instead of making a second.
//
// `ARU_E2E_SERVER=dev` opts back into `next dev` for local debugging. Nothing in the gate
// sets it.
const devServer = process.env.ARU_E2E_SERVER === "dev";

// The switch-on spec needs a server whose environment carries the owner's two revenue
// variables, and the gate's own server must NOT carry them: `NEXT_PUBLIC_COMMERCE_AFFILIATE`
// changes the disclosure sentence every other spec reads, and an override changes where
// `/api/out` sends a click. So it gets a second server of its own, on its own port and out
// of its own build directory, started by this same config — which is what keeps it inside
// `npm run smoke` on every run. Skipping the spec when the variables are absent would be a
// quarantine: the one configuration nobody ever exercises is the one the owner will deploy.
const switchOnServer = {
  // `next build` reads NEXT_PUBLIC_* and inlines them, so the build has to happen inside
  // this environment — `next start` alone would serve a bundle built without the flag.
  // `tee` mirrors the server's stdout to a file the spec can read: a rejected override is
  // a `console.warn` from `/api/out` and the product exposes it nowhere else.
  command: `npm run build && npm run start -- -H ${SWITCH_ON_HOST} -p ${SWITCH_ON_PORT} 2>&1 | tee ${SWITCH_ON_SERVER_LOG}`,
  url: SWITCH_ON_BASE_URL,
  reuseExistingServer: false,
  timeout: 600_000,
  stdout: "pipe" as const,
  env: SWITCH_ON_ENV,
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  projects: [
    { name: "mobile", testIgnore: "commerce-switch-on.spec.ts" },
    {
      name: "commerce-switch-on",
      testMatch: "commerce-switch-on.spec.ts",
      use: { baseURL: SWITCH_ON_BASE_URL },
    },
  ],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 360, height: 800 },
    trace: "retain-on-failure",
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  webServer: [{
    // Production: build, then serve what was built, in one command — so `next start` can
    // never answer from a build of an older tree, which is the same failure mode the
    // `.next/dev` cache produced in cycle 47. Dev: the clear is the first link of the
    // command, not a module-level side effect, because the config is re-imported by every
    // worker and clearing there deletes the cache from under the running server. See
    // scripts/clear-dev-cache.mjs.
    command: devServer
      ? `${reuseDevServer ? "" : "node scripts/clear-dev-cache.mjs && "}npm run dev -- --hostname ${host} --port ${port}`
      : `npm run build && npm run start -- -H ${host} -p ${port}`,
    url: baseURL,
    // Reuse is a dev-loop convenience and nothing else: against a production command it
    // would hand the run to a server started from some other build.
    reuseExistingServer: devServer && reuseDevServer,
    // The production command has a build in front of the server. Measured here on
    // 2026-09-29: `.next/BUILD_ID` was written 25 s after the run started, with Next
    // reporting `✓ Compiled successfully in 7.7s`, `Finished TypeScript in 14.0s` and
    // `✓ Generating static pages using 3 workers (27/27) in 501ms`.
    timeout: devServer ? 120_000 : 600_000,
    // Show the build. A red gate whose cause is a build error is otherwise a bare
    // "Process from config.webServer was not able to start".
    ...(devServer ? {} : { stdout: "pipe" as const }),
  }, switchOnServer],
});
