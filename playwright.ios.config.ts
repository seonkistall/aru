import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.IOS_SAFARI_PORT ?? 3103);
const baseURL = `http://${host}:${port}`;

// Same rule as `playwright.mobile.config.ts`, and for the same measured reason: a suite
// must not report a result for a tree it never loaded. Reusing whatever is listening on
// this port silently substitutes another revision's server, and the persistent
// `.next/dev` cache outlives branch checkouts. See that file for the numbers.
// `ARU_REUSE_DEV_SERVER=1` opts back into the fast interactive loop.
const reuseDevServer = process.env.ARU_REUSE_DEV_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "ios-safari-camera.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  outputDir: "test-results/ios-safari",
  projects: [
    {
      name: "ios-webkit",
      use: {
        ...devices["iPhone 17 Pro"],
        browserName: "webkit",
        baseURL,
        trace: "retain-on-failure",
      },
    },
  ],
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
