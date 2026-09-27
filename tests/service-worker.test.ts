import { createHash } from "node:crypto";
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
    expect(worker).toContain('const MEDIAPIPE_CACHE = "aru-mediapipe-v1"');
    expect(worker).toContain('cache.add("/offline.html")');
    expect(worker).toContain("caches.delete");
  });

  // `install` adds /offline.html once and only re-runs when the worker's own bytes change,
  // so before this pairing an edit to public/offline.html never reached a returning
  // visitor: the cached copy answered every navigation failure forever. The suffix of
  // SHELL_CACHE is the first 8 hex digits of sha256(public/offline.html), recomputed here
  // rather than stored, so editing that file fails this test until the constant moves —
  // and moving the constant is itself the worker-bytes change that re-runs `install`,
  // while `activate` drops the cache the old name owned.
  it("names the shell cache after the offline page it holds, so an edit to it ships", () => {
    const offline = readFileSync(resolve(root, "public/offline.html"));
    const expected = `aru-shell-${createHash("sha256").update(offline).digest("hex").slice(0, 8)}`;
    const worker = readFileSync(resolve(root, "public/sw.js"), "utf8");
    const declared = /const SHELL_CACHE = "([^"]+)"/.exec(worker)?.[1];
    expect(declared).toBe(expected);
    // The cache the name belongs to must be the one `activate` keeps, or the rename would
    // drop the entry it just filled on every start.
    expect(worker).toContain("const ACTIVE_CACHES = new Set([SHELL_CACHE, MEDIAPIPE_CACHE])");
  });

  // The page is Korean with one English sentence. A single document language made a
  // screen reader read that sentence with Korean pronunciation rules (WCAG 3.1.2).
  it("marks the offline page's English line as English", () => {
    const offline = readFileSync(resolve(root, "public/offline.html"), "utf8");
    expect(offline).toContain('<html lang="ko">');
    expect(offline).toMatch(/<small lang="en">ARU needs a connection/);
  });

  it("falls back for navigation but caches only same-origin MediaPipe assets", () => {
    const worker = readFileSync(resolve(root, "public/sw.js"), "utf8");
    expect(worker).toContain('event.request.mode === "navigate"');
    expect(worker).toContain('caches.match("/offline.html")');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.origin === self.location.origin');
    expect(worker).toContain('url.pathname.startsWith("/vendor/mediapipe/")');
    expect(worker).not.toContain("response.status === 404");
    expect(worker).not.toContain("response.status >= 500");
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
