import { defineConfig } from "@playwright/test";

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

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    headless: true,
    viewport: { width: 360, height: 800 },
    trace: "retain-on-failure",
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  webServer: {
    // The clear is the first link of the command, not a module-level side effect: the
    // config is re-imported by every worker, and clearing there deletes the cache from
    // under the running server. See scripts/clear-dev-cache.mjs.
    command: `${reuseDevServer ? "" : "node scripts/clear-dev-cache.mjs && "}npm run dev -- --hostname ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: reuseDevServer,
    timeout: 120_000,
  },
});
