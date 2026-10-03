import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTapGuard, TAP_GUARD_WINDOW_MS } from "@/lib/tap-guard";

// Fake timers so the window is exercised at exact offsets rather than by sleeping.
// `vi.useFakeTimers()` fakes `Date.now`, which is what the guard reads.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTapGuard", () => {
  it("lets the first tap through", () => {
    const guard = createTapGuard();
    expect(guard("https://example.test/a")).toBe(false);
  });

  it("suppresses a second tap inside the window", () => {
    const guard = createTapGuard();
    expect(guard("https://example.test/a")).toBe(false);
    expect(guard("https://example.test/a")).toBe(true);
  });

  it("suppresses a tap at the last millisecond of the window and lets the one at the boundary through", () => {
    const guard = createTapGuard();
    expect(guard("https://example.test/a")).toBe(false);
    vi.advanceTimersByTime(TAP_GUARD_WINDOW_MS - 1);
    expect(guard("https://example.test/a")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(guard("https://example.test/a")).toBe(false);
  });

  it("lets a deliberate tap after the window through", () => {
    const guard = createTapGuard();
    expect(guard("https://example.test/a")).toBe(false);
    vi.advanceTimersByTime(TAP_GUARD_WINDOW_MS + 200);
    expect(guard("https://example.test/a")).toBe(false);
  });

  it("keys by href, so two links on one screen never block each other", () => {
    const guard = createTapGuard();
    expect(guard("https://example.test/a")).toBe(false);
    expect(guard("https://example.test/b")).toBe(false);
    expect(guard("https://example.test/a")).toBe(true);
    expect(guard("https://example.test/b")).toBe(true);
  });

  // The property the window is measured from the last ACCEPTED tap for: a run of
  // taps spaced just under the window cannot push acceptance out forever.
  it("measures the window from the last accepted tap, not the last tap seen", () => {
    const guard = createTapGuard();
    const half = TAP_GUARD_WINDOW_MS / 2;
    expect(guard("https://example.test/a")).toBe(false); // t=0, accepted
    vi.advanceTimersByTime(half);
    expect(guard("https://example.test/a")).toBe(true); // t=400, inside the window
    vi.advanceTimersByTime(half);
    expect(guard("https://example.test/a")).toBe(false); // t=800, window from t=0 is over
  });

  it("takes a custom window", () => {
    const guard = createTapGuard(100);
    expect(guard("https://example.test/a")).toBe(false);
    vi.advanceTimersByTime(99);
    expect(guard("https://example.test/a")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(guard("https://example.test/a")).toBe(false);
  });

  it("drops keys that have fallen out of the window instead of growing forever", () => {
    const guard = createTapGuard();
    for (let i = 0; i < 50; i += 1) {
      expect(guard(`https://example.test/${i}`)).toBe(false);
      vi.advanceTimersByTime(TAP_GUARD_WINDOW_MS);
    }
    // Every earlier key is outside the window by now, so each one taps clean again.
    expect(guard("https://example.test/0")).toBe(false);
    expect(guard("https://example.test/0")).toBe(true);
  });

  it("gives each guard its own store", () => {
    const one = createTapGuard();
    const two = createTapGuard();
    expect(one("https://example.test/a")).toBe(false);
    expect(two("https://example.test/a")).toBe(false);
    expect(one("https://example.test/a")).toBe(true);
  });
});
