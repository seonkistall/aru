import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FUNNEL_ORDER } from "@/lib/funnel";

/**
 * A live camera dying and the user switching tabs both land on the same screen, and
 * until now on the same silence. `interruptCamera` took no argument, so
 * `watchCameraStream`'s "muted"/"ended" reason was discarded at the callback and
 * nothing was recorded at all — another app taking the camera mid-scan left no trace
 * in the funnel, while the copy told the user to turn their camera back on as if they
 * had switched away themselves.
 *
 * The two cases have to be told apart before either is counted, which is why the
 * reason is carried from the call site: `visibilitychange`/`pagehide` are ARU stopping
 * its own stream and are not a loss.
 *
 * Same shape and same limits as tests/camera-denied-reason.test.ts: a source contract,
 * not a dataflow proof. It will fail on a legitimate rewrite of these call sites, and
 * the right response is to update the parser, not to delete the file. The load-bearing
 * assertion is the count — no bare `interruptCamera()` anywhere.
 */

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "app/scan/page.tsx"), "utf8");
/** Comment-only lines stripped, so a comment naming a call is not read as the call. */
const page = source
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

describe("a camera interruption carries why it happened", () => {
  it("never calls interruptCamera without a reason", () => {
    expect(page).not.toMatch(/interruptCamera\(\s*\)/);
  });

  it("hands the backgrounding callers their own reason", () => {
    // Both of these are ARU stopping its own stream, not the camera being taken away.
    expect(page).toContain('if (document.hidden) interruptCamera("backgrounded")');
    expect(page).toContain('const handlePageHide = () => interruptCamera("backgrounded")');
  });

  it("passes the watcher's reason straight through instead of dropping it", () => {
    // watchCameraStream(stream, cb) calls cb("muted" | "ended"); handing it
    // interruptCamera directly is what forwards that, and a wrapper that swallowed
    // the argument is exactly the bug.
    expect(page).toContain("watchCameraStream(stream, interruptCamera)");
    expect(page).toMatch(
      /const interruptCamera = useCallback\(\(reason: CameraInterruptionReason \| "backgrounded"\)/
    );
  });

  it("stores the reason, so the screen can branch on it", () => {
    // Without this the render below branches on a state that never leaves its initial
    // "backgrounded" value, so a seized camera shows the backgrounding copy — the bug
    // this file exists for, with every other assertion here still passing. Found by
    // deleting the line and watching the suite stay green.
    expect(page).toContain("setInterruptReason(reason)");
  });

  it("records the interruption in the funnel, with the reason attached", () => {
    expect(page).toContain('recordFunnelEvent("camera_interrupted", { reason })');
    expect(FUNNEL_ORDER).toContain("camera_interrupted");
  });

  it("does not reuse the camera_blocked copy for a camera that had already started", () => {
    // camera_blocked is a camera that never opened. On this screen the permission is
    // granted and the hardware worked a second ago, so the block screen's instruction
    // ("grant camera permission") is wrong, and so is telling someone whose camera was
    // seized that they should turn it back on.
    const screen = page.slice(page.indexOf('{phase === "interrupted" && ('));
    const block = screen.slice(0, screen.indexOf('{phase === "noface"'));
    expect(block).toContain('interruptReason === "backgrounded"');
    expect(block).toContain("다른 앱이 카메라를 쓰고 있을 수 있어요");
    expect(block).not.toContain("카메라 권한이 필요해요");
  });
});
