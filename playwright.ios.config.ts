import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.IOS_SAFARI_PORT ?? 3103);
const baseURL = `http://${host}:${port}`;

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
    command: `npm run dev -- --hostname ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
