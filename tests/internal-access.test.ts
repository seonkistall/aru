import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { internalAccessDecision } from "@/lib/server/internal-access";

const root = resolve(import.meta.dirname, "..");
const prodEnv = {
  NODE_ENV: "production",
  INTERNAL_TOOLS_USER: "aru",
  INTERNAL_TOOLS_PASSWORD: "correct horse battery staple",
};

function basic(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

function request(authorization?: string, url = "https://aru-beauty.vercel.app/ops") {
  return new Request(url, { headers: authorization ? { authorization } : {} });
}

describe("internal production access", () => {
  it("allows local development without staff credentials", () => {
    expect(internalAccessDecision(request(), { NODE_ENV: "development" })).toBe("allow");
  });

  it("hides internal routes when production credentials are absent", () => {
    expect(internalAccessDecision(request(), { NODE_ENV: "production" })).toBe("not-found");
    expect(internalAccessDecision(request(), { NODE_ENV: "production", INTERNAL_TOOLS_USER: "aru" })).toBe("not-found");
  });

  it("challenges missing, malformed, or incorrect Basic credentials", () => {
    expect(internalAccessDecision(request(), prodEnv)).toBe("challenge");
    expect(internalAccessDecision(request("Bearer secret"), prodEnv)).toBe("challenge");
    expect(internalAccessDecision(request("Basic bad"), prodEnv)).toBe("challenge");
    expect(internalAccessDecision(request(basic("aru", "wrong")), prodEnv)).toBe("challenge");
  });

  it("allows only the exact configured Basic credentials", () => {
    expect(internalAccessDecision(request(basic("aru", "correct horse battery staple")), prodEnv)).toBe("allow");
    expect(internalAccessDecision(request(basic("ARU", "correct horse battery staple")), prodEnv)).toBe("challenge");
  });

  it("ignores credentials placed in the URL", () => {
    expect(internalAccessDecision(request(undefined, "https://aru-beauty.vercel.app/ops?token=correct%20horse%20battery%20staple"), prodEnv)).toBe("challenge");
  });
});

describe("internal route boundary", () => {
  it("matches all three staff routes in the Next.js 16 proxy", () => {
    const source = readFileSync(resolve(root, "proxy.ts"), "utf8");
    for (const route of ["/ops/:path*", "/pilot/:path*", "/eval/:path*"]) expect(source).toContain(route);
    expect(source).toContain("WWW-Authenticate");
  });

  it("marks every internal route noindex", () => {
    for (const route of ["ops", "pilot", "eval"]) {
      const source = readFileSync(resolve(root, `app/${route}/layout.tsx`), "utf8");
      expect(source).toContain("index: false");
      expect(source).toContain("follow: false");
    }
  });
});
