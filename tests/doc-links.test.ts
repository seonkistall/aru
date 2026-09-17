import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

/**
 * Cycle 10 split `docs/AUTOPILOT.md` in two and had to hand-fix every reference into
 * the moved half. Nothing in the tree checked those, so a pointer left aimed at a file
 * that no longer holds the text would have shipped silently. This is that check, for
 * every markdown doc rather than only the two that moved.
 */

function markdownFiles(): string[] {
  const found = ["README.md", "AGENTS.md", "CLAUDE.md", "AUTOPILOT.md"].filter((file) =>
    existsSync(resolve(root, file)),
  );
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".md")) found.push(path);
    }
  };
  walk("docs");
  return found;
}

/** `[label](target)` — skipping absolute URLs, which this network cannot resolve anyway. */
function localLinks(source: string): string[] {
  return [...source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:|#)/.test(target));
}

describe("documentation cross-references", () => {
  it("resolves every relative link in every markdown doc", () => {
    const dangling: string[] = [];
    let checked = 0;
    for (const file of markdownFiles()) {
      for (const target of localLinks(readFileSync(resolve(root, file), "utf8"))) {
        const path = target.split("#")[0];
        if (!path) continue;
        checked += 1;
        const resolved = resolve(root, dirname(file), path);
        if (!existsSync(resolved)) {
          dangling.push(`${file} -> ${target} (no ${relative(root, resolved)})`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(dangling).toEqual([]);
  });

  it("keeps the autopilot archive reachable from the file a cycle actually reads", () => {
    const live = readFileSync(resolve(root, "docs/AUTOPILOT.md"), "utf8");
    const archive = readFileSync(resolve(root, "docs/autopilot-changelog.md"), "utf8");
    // Orphaning the archive would lose 1,381 lines of history to anything that starts
    // from AUTOPILOT.md, which is what every worker brief tells a cycle to do.
    expect(live).toContain("autopilot-changelog.md");
    expect(archive).toContain("AUTOPILOT.md");
  });
});
