import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Studio from "@/app/studio/page";

/**
 * /studio's emphasis toggle said the opposite of its state.
 *
 * Each card row has a button whose visible label names the row's current state, 차분
 * (calm) or 강조 (bold), and it also carried aria-pressed={read.calm}. So an emphasised
 * row was announced "Bold, toggle button, not pressed", which tells the user the row is
 * not bold when it is, and a row from the 유분 케어 preset (calm unset) dropped the
 * attribute and stopped being a toggle at all. A button whose label changes with its
 * state is not a pressed/unpressed toggle, so the attribute is gone and the label alone
 * carries the state. Found by the cycle 117 bug hunt.
 */
describe("/studio emphasis toggle", () => {
  it("carries no aria-pressed that could contradict its label", () => {
    const html = renderToString(createElement(Studio));
    const toggles = [...html.matchAll(/<button[^>]*>(차분|강조)<\/button>/g)];
    expect(toggles.length).toBeGreaterThan(0);
    for (const [markup] of toggles) expect(markup).not.toContain("aria-pressed");
  });
});
