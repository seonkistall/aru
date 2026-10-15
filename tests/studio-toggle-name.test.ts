import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Studio from "@/app/studio/page";
import { t } from "@/lib/i18n/core";

/**
 * /studio's four emphasis toggles all had the same accessible name.
 *
 * Each card row (유분, 모공/결, 붉은기, 전반) ends in a button whose only name was its
 * visible text, 차분 or 강조, with nothing saying which row it belongs to. On the default
 * card all four are 차분, so a screen-reader user tabbing through, or listing the page's
 * buttons, heard "차분" four times, and a voice-control user saying "click 차분" could not
 * reach a particular row. Each toggle is now labelled by its own text followed by its
 * row's name field (aria-labelledby), so the name is e.g. "차분 유분": the visible label
 * still starts the name (WCAG 2.5.3), no new wording is added, and the name follows the
 * row when the visitor renames it.
 *
 * Checked on the server-rendered markup with the accessible-name rules that apply here:
 * aria-labelledby wins over the button's content, and an <input> it points at gives its
 * current value (accname 1.2, "embedded control": a textbox contributes its value).
 *
 * Found by the cycle 117 bug hunt; fixed in cycle 118.
 */

type Tag = { tag: string; attrs: Record<string, string>; text: string };

function decode(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attrsOf(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, value] of source.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[name] = decode(value);
  return attrs;
}

/** The row markup: name field, value field, toggle (the toggle is the `input + button`). */
function rows(html: string) {
  return [...html.matchAll(/<input([^>]*)\/><input([^>]*)\/><button([^>]*)>([^<]*)<\/button>/g)].map(
    ([, name, value, toggle, text]) => ({
      name: attrsOf(name),
      value: attrsOf(value),
      toggle: { tag: "button", attrs: attrsOf(toggle), text: decode(text) } as Tag,
    }),
  );
}

function byId(html: string, id: string): Tag | null {
  for (const [, tag, attrs, text] of html.matchAll(/<(\w+)([^>]*?)\/?>(?:([^<]*)<\/\1>)?/g)) {
    const parsed = attrsOf(attrs);
    if (parsed.id === id) return { tag, attrs: parsed, text: decode(text ?? "") };
  }
  return null;
}

function accessibleName(html: string, el: Tag): string {
  const labelledBy = el.attrs["aria-labelledby"];
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => {
        const ref = byId(html, id);
        expect(ref, `aria-labelledby points at "${id}", which is not on the page`).not.toBeNull();
        if (ref!.tag === "input") return ref!.attrs.value ?? "";
        return ref!.attrs["aria-label"] ?? ref!.text;
      })
      .join(" ")
      .trim();
  }
  return (el.attrs["aria-label"] ?? el.text).trim();
}

describe("/studio emphasis toggle names", () => {
  const html = renderToString(createElement(Studio));
  const found = rows(html);

  it("finds the four card rows", () => {
    expect(found.map((row) => row.name.value)).toEqual([t("유분"), t("모공/결"), t("붉은기"), t("전반")]);
  });

  it("names each toggle by its own text and then its row", () => {
    for (const row of found) {
      const name = accessibleName(html, row.toggle);
      // WCAG 2.5.3: the visible label starts the accessible name.
      expect(name.startsWith(row.toggle.text), `"${name}" does not start with its visible text "${row.toggle.text}"`).toBe(true);
      expect(name, `the toggle on the ${row.name.value} row does not name its row`).toContain(row.name.value);
      expect(name).toBe(`${t("차분")} ${row.name.value}`);
    }
  });

  it("gives the four toggles four different names", () => {
    const names = found.map((row) => accessibleName(html, row.toggle));
    expect(new Set(names).size, `names: ${JSON.stringify(names)}`).toBe(found.length);
  });

  it("uses each id once", () => {
    const ids = [...html.matchAll(/\sid="([^"]*)"/g)].map(([, id]) => id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
