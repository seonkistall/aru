import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { SEO_ROUTES, SITE_URL, absoluteUrl, seoMetadata, seoRoute } from "../lib/seo";
import { efficacyClean } from "../lib/recommend";

/**
 * Cycle 39. Before this, `/robots.txt` and `/sitemap.xml` were both 404 and all
 * nine reachable pages shared one title and one description, so a search result
 * for any of them would have read the same line.
 *
 * This file pins the two things a doc sentence cannot keep true: that the route
 * table is the single source for the sitemap, the canonicals and the
 * index/noindex split, and that no metadata string makes a medical claim.
 */

const INDEXABLE = ["/", "/scan", "/survey", "/privacy"];
const NOINDEX = ["/report", "/care", "/checkin", "/studio", "/unsubscribe", "/ops", "/pilot", "/eval"];

/**
 * `efficacyClean`'s list is Korean, and every string in `SEO_ROUTES` is English,
 * so passing it is necessary and nowhere near sufficient. These are the English
 * equivalents: the claims guardrail 3 forbids, plus the efficacy promises that
 * turn a description into an advert a regulator reads differently.
 */
const ENGLISH_CLAIMS = [
  "treat",
  "cure",
  "heal",
  "diagnos",
  "acne",
  "dermatolog",
  "clinical",
  "prescription",
  "remedy",
  "therapy",
  "anti-aging",
  "antiaging",
  "whitening",
  "eliminate",
  "guaranteed",
  "proven",
  "medical",
  "condition",
  "disease",
];

function appRoutes(): string[] {
  const found: string[] = [];
  const walk = (dir: string, urlPath: string) => {
    if (existsSync(join(dir, "page.tsx"))) found.push(urlPath === "" ? "/" : urlPath);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "api" || entry.name === "components" || entry.name.startsWith("_")) continue;
      if (entry.name.startsWith("[")) continue;
      walk(join(dir, entry.name), `${urlPath}/${entry.name}`);
    }
  };
  walk("app", "");
  return found.sort();
}

describe("the route table", () => {
  it("has one entry per path and every path is absolute", () => {
    const paths = SEO_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p.startsWith("/")).toBe(true);
  });

  it("splits index/noindex exactly as measured on a first visit with empty storage", () => {
    expect(SEO_ROUTES.filter((r) => r.index).map((r) => r.path)).toEqual(INDEXABLE);
    expect(SEO_ROUTES.filter((r) => !r.index).map((r) => r.path)).toEqual(NOINDEX);
  });

  /**
   * `/` has no layout of its own, so it is served by the root layout's metadata
   * and so is anything else that ships without one. A new page added without a
   * `layout.tsx` would silently inherit `/`'s canonical and be marked indexable.
   * This is the guard against that.
   */
  it("covers every page in app/ except the /reco redirect", () => {
    const registered = new Set(SEO_ROUTES.map((r) => r.path));
    const missing = appRoutes().filter((p) => p !== "/reco" && !registered.has(p));
    expect(missing).toEqual([]);
  });

  it("gives /reco no entry, because it answers 307 and renders nothing a crawler keeps", () => {
    expect(readFileSync("app/reco/page.tsx", "utf8")).toContain('redirect("/report")');
    expect(SEO_ROUTES.some((r) => r.path === "/reco")).toBe(false);
  });

  it("gives every route a title and a description of its own", () => {
    const titles = SEO_ROUTES.map((r) => r.title);
    const descriptions = SEO_ROUTES.map((r) => r.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const r of SEO_ROUTES) {
      expect(r.title.length).toBeGreaterThan(8);
      expect(r.description.length).toBeGreaterThan(30);
    }
  });
});

describe("no metadata string makes a medical claim", () => {
  for (const route of SEO_ROUTES) {
    it(`${route.path} passes efficacyClean and the English claim list`, () => {
      expect(efficacyClean(route.title)).toEqual({ ok: true, flagged: [] });
      expect(efficacyClean(route.description)).toEqual({ ok: true, flagged: [] });
      const text = `${route.title} ${route.description}`.toLowerCase();
      expect(ENGLISH_CLAIMS.filter((word) => text.includes(word))).toEqual([]);
    });
  }
});

describe("robots.txt", () => {
  const output = robots();

  it("allows the site, disallows /api/ and names the sitemap", () => {
    expect(output.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/api/"] }]);
    expect(output.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  /**
   * A `Disallow` stops a crawler fetching the page, so it never reads the
   * `noindex` tag on it. Disallowing a noindex route would defeat the tag.
   */
  it("disallows no route that relies on a noindex tag", () => {
    const disallow = ([] as string[]).concat(
      ...[output.rules].flat().map((rule) => [rule.disallow ?? []].flat()),
    );
    for (const path of NOINDEX) expect(disallow).not.toContain(path);
    for (const path of NOINDEX) expect(disallow).not.toContain(`${path}/`);
  });
});

describe("sitemap.xml", () => {
  const entries = sitemap();

  it("lists exactly the indexable routes, as absolute URLs on the shipped origin", () => {
    expect(entries.map((e) => e.url)).toEqual(INDEXABLE.map(absoluteUrl));
    for (const e of entries) expect(e.url.startsWith("https://")).toBe(true);
  });

  it("lists nothing that carries a noindex tag", () => {
    const urls = new Set(entries.map((e) => e.url));
    for (const path of NOINDEX) expect(urls.has(absoluteUrl(path))).toBe(false);
  });

  /** A stamp nothing in the repository knows is a fabricated number. */
  it("claims no lastModified", () => {
    for (const e of entries) expect(e.lastModified).toBeUndefined();
  });
});

describe("per-route metadata", () => {
  it("canonicalises each route to its own path", () => {
    for (const route of SEO_ROUTES) {
      expect(seoMetadata(route.path).alternates?.canonical).toBe(route.path);
    }
  });

  it("marks indexable routes index and the rest noindex", () => {
    for (const route of SEO_ROUTES) {
      expect(seoMetadata(route.path).robots).toEqual(
        route.index ? { index: true, follow: true } : { index: false, follow: false },
      );
    }
  });

  /**
   * Next.js replaces a metadata field in a child segment rather than merging it,
   * so a route layout that set only `openGraph.title` would ship a page with no
   * preview image. Every route writes the block out in full.
   */
  it("keeps the share-preview image on every route", () => {
    for (const route of SEO_ROUTES) {
      const meta = seoMetadata(route.path);
      expect(meta.openGraph?.images).toEqual([
        { url: "/og.png", width: 1200, height: 630, alt: "ARU today's skin report" },
      ]);
      expect(meta.twitter?.images).toEqual(["/og.png"]);
      expect(meta.openGraph?.title).toBe(route.title);
    }
  });

  it("refuses a path it does not know", () => {
    expect(() => seoRoute("/nope")).toThrow("No SEO route registered for /nope");
  });
});

describe("every route layout reads the table", () => {
  for (const route of SEO_ROUTES) {
    if (route.path === "/") continue;
    it(`app${route.path}/layout.tsx calls seoMetadata("${route.path}")`, () => {
      const source = readFileSync(`app${route.path}/layout.tsx`, "utf8");
      expect(source).toContain(`seoMetadata("${route.path}")`);
    });
  }

  it("the root layout serves / from the table and keeps metadataBase on the shipped origin", () => {
    const source = readFileSync("app/layout.tsx", "utf8");
    expect(source).toContain('seoMetadata("/")');
    expect(source).toContain("metadataBase: new URL(SITE_URL)");
    expect(SITE_URL).toBe("https://aru-beauty.vercel.app");
  });
});
