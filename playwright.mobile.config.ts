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
    command: `npm run dev -- --hostname ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
