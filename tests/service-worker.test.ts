import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("safe ARU service worker", () => {
  it("pre-caches only the offline shell and removes old caches", () => {
    const workerPath = resolve(root, "public/sw.js");
    const offlinePath = resolve(root, "public/offline.html");
    expect(existsSync(workerPath)).toBe(true);
    expect(existsSync(offlinePath)).toBe(true);

    const worker = readFileSync(workerPath, "utf8");
    expect(worker).toContain('const SHELL_CACHE = "aru-shell-v1"');
    expect(worker).toContain('const MEDIAPIPE_CACHE = "aru-mediapipe-v1"');
    expect(worker).toContain('cache.add("/offline.html")');
    expect(worker).toContain("caches.delete");
  });

  it("falls back for navigation but caches only same-origin MediaPipe assets", () => {
    const worker = readFileSync(resolve(root, "public/sw.js"), "utf8");
    expect(worker).toContain('event.request.mode === "navigate"');
    expect(worker).toContain('caches.match("/offline.html")');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.origin === self.location.origin');
    expect(worker).toContain('url.pathname.startsWith("/vendor/mediapipe/")');
    expect(worker).not.toMatch(/cache\.put\([^)]*api/i);
  });

  it("registers the root-scoped worker from the app layout", () => {
    const registration = readFileSync(resolve(root, "app/components/service-worker-registration.tsx"), "utf8");
    const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
    expect(registration).toContain('navigator.serviceWorker.register("/sw.js", { scope: "/" })');
    expect(registration).toContain(".catch(() => undefined)");
    expect(registration).toContain('window.addEventListener("load"');
    expect(layout).toContain("<ServiceWorkerRegistration />");
  });

  it("probes the worker and offline fallback in production smoke", () => {
    const smoke = readFileSync(resolve(root, "scripts/smoke-test.mjs"), "utf8");
    expect(smoke).toContain('path: "/offline.html"');
    expect(smoke).toContain('path: "/sw.js"');
    expect(smoke).toContain("bodyIncludes");
  });
});
