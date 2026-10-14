import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DEVICE_DATA_KEY } from "@/lib/device-data";

/**
 * /ops built its P001-P030 board in the render body, from localStorage. The server
 * (no window) rendered every cell "open"; the client's hydration render rendered the
 * stored statuses, so once one pilot note existed React reported a hydration mismatch
 * and threw the server tree away. /pilot had already moved the same read into an
 * effect. Found by the cycle 116 bug hunt; this is its probe, kept.
 */

afterEach(() => vi.unstubAllGlobals());

function cells(html: string) {
  return [...html.matchAll(/<b>(P0\d\d)<\/b><span>([^<]*)<\/span>/g)].map((m) => `${m[1]}=${m[2]}`);
}

describe("/ops first render", () => {
  it("is the same on the server and on a client that has pilot notes stored", async () => {
    const Ops = (await import("@/app/ops/page")).default;

    const server = renderToString(createElement(Ops));

    const data = new Map<string, string>([
      [
        DEVICE_DATA_KEY.pilotNotes,
        JSON.stringify([
          { id: "n1", participant: "P001", participantId: "P001", sessionId: "P001-1", status: "scanned", browser: "ios-safari", lighting: "window", makeup: "none", glasses: false, hairCover: false, scanCompleted: true, consentAi: true, consentCrop: true, notes: "", ts: 1 },
        ]),
      ],
    ]);
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
    const client = renderToString(createElement(Ops));

    expect(cells(server)).toHaveLength(30);
    expect(cells(client)).toEqual(cells(server));
    expect(client).toBe(server);
  });

  // renderToString runs no effect, so the test above would also pass if the board simply
  // stopped showing stored statuses. This pins that it still reads them, after mount.
  it("still fills the board from the store, through the snapshot read after mount", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../app/ops/page.tsx"), "utf8");
    const read = source.slice(source.indexOf("function readSnapshot(): OpsSnapshot {"), source.indexOf("function buildRoster()"));
    expect(read).toContain("roster: buildRoster(),");
    expect(source).toContain("{snapshot.roster.map((item) => (");
    expect(source).toMatch(/setSnapshot\(readSnapshot\(\)\)/);
  });
});
