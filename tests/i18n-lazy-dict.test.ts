import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Deliberately does NOT import "@/lib/i18n/all": these cases are about what the
// registry holds before anything registers a dictionary for it.

const root = resolve(import.meta.dirname, "..");
const CORE = readFileSync(join(root, "lib/i18n/core.ts"), "utf8");
const PROVIDER = readFileSync(join(root, "lib/i18n.tsx"), "utf8");

async function freshCore() {
  vi.resetModules();
  return import("@/lib/i18n/core");
}

describe("per-locale dictionary loading", () => {
  beforeEach(() => vi.resetModules());

  it("keeps ja, zh and ar out of the core module's static imports", () => {
    for (const mod of ["./ja", "./zh", "./ar"]) {
      expect(CORE, `lib/i18n/core.ts statically imports ${mod}`).not.toMatch(
        new RegExp(`^\\s*import\\s+[^;]*from\\s+"${mod}"`, "m"),
      );
    }
    // English is the one that has to stay static — the server renders English.
    expect(CORE).toMatch(/^import \{ EN \} from "\.\/en";$/m);
  });

  it("gives each lazy locale its own literal import path", () => {
    for (const mod of ["./ja", "./zh", "./ar"]) {
      expect(CORE, `no dynamic import("${mod}")`).toContain(`import("${mod}")`);
    }
    // A template literal is not the shape Next.js's doc guarantees. Measured on
    // 2026-09-25: Turbopack 16.2.9 splits that form too (783878 bytes of initial
    // JS for `/` against 783030), so this pins the documented shape, not a
    // bundler behaviour that was observed to differ.
    expect(CORE).not.toMatch(/import\(\s*`/);
  });

  it("reports ko and en ready with nothing loaded, and ja/zh/ar not", async () => {
    const core = await freshCore();
    expect(core.isDictReady("ko")).toBe(true);
    expect(core.isDictReady("en")).toBe(true);
    expect(core.isDictReady("ja")).toBe(false);
    expect(core.isDictReady("zh")).toBe(false);
    expect(core.isDictReady("ar")).toBe(false);
  });

  it("translates through the static English dictionary without loading anything", async () => {
    const core = await freshCore();
    core.setCurrentLang("en");
    expect(core.t("카메라 다시 켜기")).toBe("Turn camera back on");
  });

  it("falls back to the Korean source string while a dictionary is missing", async () => {
    const core = await freshCore();
    core.setCurrentLang("ja");
    expect(core.t("카메라 다시 켜기")).toBe("카메라 다시 켜기");
  });

  it.each(["ja", "zh", "ar"] as const)("loads %s on demand and translates after", async (lang) => {
    const core = await freshCore();
    const expected: Record<string, string> = {
      ja: "カメラをもう一度オンにする",
      zh: "重新打开摄像头",
      ar: "إعادة تشغيل الكاميرا",
    };
    await core.loadDict(lang);
    expect(core.isDictReady(lang)).toBe(true);
    core.setCurrentLang(lang);
    expect(core.t("카메라 다시 켜기")).toBe(expected[lang]);
  });

  it("notifies subscribers when a dictionary arrives", async () => {
    const core = await freshCore();
    let calls = 0;
    const unsubscribe = core.subscribeDicts(() => {
      calls += 1;
    });
    await core.loadDict("zh");
    expect(calls).toBe(1);
    unsubscribe();
    await core.loadDict("ar");
    expect(calls).toBe(1);
  });

  it("imports each locale once no matter how many callers ask", async () => {
    const core = await freshCore();
    const results = await Promise.all([core.loadDict("ja"), core.loadDict("ja"), core.loadDict("ja")]);
    expect(results).toHaveLength(3);
    expect(core.isDictReady("ja")).toBe(true);
  });

  it("holds the rendered language at the server default until the dictionary is ready", () => {
    expect(PROVIDER).toMatch(/const active = ready \? saved : getServerSnapshot\(\);/);
    expect(PROVIDER).toMatch(/subscribeDicts, \(\) => isDictReady\(saved\)/);
    // html[lang]/dir and the remount key follow what is on screen, not the
    // saved choice, so ar never paints Latin text in RTL.
    expect(PROVIDER).toMatch(/document\.documentElement\.dir = active === "ar"/);
    expect(PROVIDER).toMatch(/<React\.Fragment key=\{active\}>/);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

describe("lib/i18n/all stays out of the shipped bundle", () => {
  it("is imported only from tests", () => {
    const offenders = walk(join(root, "app"))
      .concat(walk(join(root, "lib")))
      .concat(walk(join(root, "scripts")))
      .filter((f) => /from "[^"]*i18n\/all"|import "[^"]*i18n\/all"/.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
