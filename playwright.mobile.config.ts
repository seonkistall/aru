import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.MOBILE_UI_PORT ?? 3102);
const baseURL = `http://${host}:${port}`;

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
  },
  webServer: {
    command: `npm run dev -- --hostname ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
