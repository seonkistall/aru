import { describe, expect, it } from "vitest";
import { addCommerceTracking, buildCommerceLinks, isAllowedCommerceUrl } from "@/lib/commerce";

describe("isAllowedCommerceUrl (allowlist)", () => {
  it("allows the four https merchant hosts", () => {
    expect(isAllowedCommerceUrl("https://www.oliveyoung.co.kr/store/search")).toBe(true);
    expect(isAllowedCommerceUrl("https://search.shopping.naver.com/search/all")).toBe(true);
    expect(isAllowedCommerceUrl("https://www.coupang.com/np/search")).toBe(true);
    expect(isAllowedCommerceUrl("https://www.google.com/search")).toBe(true);
  });

  it("rejects http, unknown hosts, and garbage", () => {
    expect(isAllowedCommerceUrl("http://www.oliveyoung.co.kr")).toBe(false); // not https
    expect(isAllowedCommerceUrl("https://evil.example.com")).toBe(false);
    expect(isAllowedCommerceUrl("https://oliveyoung.co.kr")).toBe(false); // bare host not in set
    expect(isAllowedCommerceUrl("not a url")).toBe(false);
  });
});

describe("addCommerceTracking (UTM)", () => {
  it("appends the fixed campaign params and an identifying content tag", () => {
    const out = addCommerceTracking("https://www.coupang.com/np/search?q=x", {
      sku: "sku42",
      merchant: "coupang",
      placement: "reco",
    });
    const url = new URL(out);
    expect(url.searchParams.get("utm_source")).toBe("kbeauty_ai_camera");
    expect(url.searchParams.get("utm_medium")).toBe("commerce_link");
    expect(url.searchParams.get("utm_campaign")).toBe("skin_scan_recommendation");
    expect(url.searchParams.get("utm_content")).toBe("reco_sku42_coupang");
    expect(url.searchParams.get("q")).toBe("x"); // preserves existing query
  });

  it("produces a URL that still passes the allowlist", () => {
    const out = addCommerceTracking("https://www.oliveyoung.co.kr/store/search?query=a", {
      sku: "s",
      merchant: "oliveyoung",
      placement: "care",
    });
    expect(isAllowedCommerceUrl(out)).toBe(true);
  });
});

describe("buildCommerceLinks", () => {
  it("builds four ordered links whose hrefs are all allowlisted", () => {
    const links = buildCommerceLinks({ id: "1", brand: "라운드랩", name: "독도 토너" });
    expect(links.map((l) => l.merchant)).toEqual([
      "oliveyoung",
      "naver-shopping",
      "coupang",
      "global-search",
    ]);
    for (const link of links) {
      expect(isAllowedCommerceUrl(link.href), link.href).toBe(true);
    }
  });
});
