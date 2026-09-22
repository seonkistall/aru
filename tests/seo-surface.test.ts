import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { CRAWLER_DISALLOW, INDEXABLE_PATHS, SESSION_ONLY_PATHS, SITE_ORIGIN } from "@/lib/site";

const root = resolve(import.meta.dirname, "..");

describe("what a crawler is told", () => {
  it("never allows and disallows the same path", () => {
    // A url in the sitemap that robots.txt refuses is reported in Search Console as a
    // broken sitemap, which sends you looking at the sitemap instead of at the rule.
    for (const entry of INDEXABLE_PATHS) {
      for (const blocked of CRAWLER_DISALLOW) {
        const collides = blocked === "/" ? entry.path === "/" : entry.path.startsWith(blocked);
        expect(collides, `${entry.path} is both indexable and disallowed by ${blocked}`).toBe(false);
      }
    }
  });

  it("keeps every research surface out of the crawl", () => {
    // These export participant data. Their layouts send robots: noindex, which is a
    // response header and only applies once the page has already been served.
    for (const path of ["/ops", "/pilot", "/eval"]) {
      expect(CRAWLER_DISALLOW).toContain(path);
      expect(INDEXABLE_PATHS.map((entry) => entry.path)).not.toContain(path);
    }
    const rules = robots().rules;
    const disallow = Array.isArray(rules) ? rules.flatMap((rule) => rule.disallow ?? []) : rules.disallow ?? [];
    for (const path of ["/ops", "/pilot", "/eval", "/api/"]) {
      expect(disallow).toContain(path);
    }
  });

  it("points at a sitemap on the same origin as metadataBase", () => {
    // Two literals for one origin is how a sitemap ends up advertising a host the app
    // is not served from.
    const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
    expect(layout, "app/layout.tsx metadataBase must match lib/site.ts SITE_ORIGIN").toContain(SITE_ORIGIN);
    expect(robots().sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
    // `Host:` is a Yandex extension taking a bare hostname; Next would emit the full
    // origin, which is a line no crawler accepts and none needs.
    expect(robots().host).toBeUndefined();
    for (const entry of sitemap()) {
      expect(entry.url.startsWith(SITE_ORIGIN)).toBe(true);
    }
  });

  it("emits every indexable path and nothing else", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      SITE_ORIGIN,
      `${SITE_ORIGIN}/scan`,
      `${SITE_ORIGIN}/privacy`,
    ]);
  });

  it("claims no lastModified it cannot support", () => {
    // A build-time `new Date()` would tell crawlers all three pages changed on every
    // deploy, whether or not any of them did. Asserted on the emitted entries rather
    // than on the source text, which mentions the trap in a comment.
    for (const entry of sitemap()) {
      expect(entry.lastModified).toBeUndefined();
    }
  });

  it("does not index a page whose crawlable state is empty", () => {
    // Derived from SESSION_ONLY_PATHS, not from a second hand-written list: the first
    // version of this test repeated four paths and could not see that /survey — which
    // reads the same sessionStorage — was in neither list and therefore crawlable.
    expect(SESSION_ONLY_PATHS.length).toBeGreaterThan(0);
    for (const path of SESSION_ONLY_PATHS) {
      expect(INDEXABLE_PATHS.map((entry) => entry.path)).not.toContain(path);
      expect(CRAWLER_DISALLOW).toContain(path);
    }
  });

  it("leaves no page unclassified", () => {
    // The check that would have caught /survey, which was in neither list and so was
    // crawlable by `Allow: /` while being in no sitemap. Not keyed on sessionStorage:
    // /privacy reads it too and is still worth indexing, because it renders real
    // static copy. The invariant is simply that every page is a decision someone took.
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
        if (entry.name === "api" || entry.name === "components") continue;
        if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
        else if (entry.name === "page.tsx") pages.push(dir === "app" ? "/" : dir.replace(/^app/, ""));
      }
    };
    walk("app");
    expect(pages.length).toBeGreaterThan(5);
    const indexable = INDEXABLE_PATHS.map((entry) => entry.path);
    for (const path of pages) {
      const classified = indexable.includes(path) || CRAWLER_DISALLOW.includes(path);
      expect(classified, `${path} is in neither INDEXABLE_PATHS nor CRAWLER_DISALLOW in lib/site.ts`).toBe(true);
    }
  });
});
