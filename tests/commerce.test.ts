import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  addCommerceTracking,
  auditCommerceOverrides,
  buildCommerceLinks,
  commerceOverrideUrl,
  isAllowedCommerceUrl,
} from "@/lib/commerce";

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

describe("COMMERCE_LINK_OVERRIDES_JSON rejections are visible, not silent", () => {
  // The whole point of the override env is to turn a search URL into a real
  // affiliate product URL. A rejected override falls back to the search URL, which
  // is indistinguishable from no override at all — so a wrong host costs every
  // click until someone thinks to check, while NEXT_PUBLIC_COMMERCE_AFFILIATE=on
  // is separately telling users the link earns a commission.
  const REJECTED = "https://smartstore.naver.com/PARTNER/products/123";

  it("names a blocked host instead of dropping it", () => {
    const audit = auditCommerceOverrides(JSON.stringify({ sr2: { "naver-shopping": REJECTED } }));
    expect(audit.configured).toBe(true);
    expect(audit.parsed).toBe(true);
    expect(audit.accepted).toEqual([]);
    expect(audit.issues).toEqual([
      { sku: "sr2", merchant: "naver-shopping", value: REJECTED, reason: "not-https-or-allowlisted" },
    ]);
  });

  it("separates an accepted override from a rejected one in the same blob", () => {
    const good = "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000123456";
    const audit = auditCommerceOverrides(JSON.stringify({
      tn1: { oliveyoung: good },
      sr2: { "naver-shopping": REJECTED },
    }));
    expect(audit.accepted).toEqual([{ sku: "tn1", merchant: "oliveyoung", value: good }]);
    expect(audit.issues.map((issue) => issue.sku)).toEqual(["sr2"]);
  });

  it("names a misspelled merchant key, which never matches a lookup either", () => {
    const audit = auditCommerceOverrides(JSON.stringify({
      tn1: { oliveyung: "https://www.coupang.com/vp/products/1" },
    }));
    expect(audit.accepted).toEqual([]);
    expect(audit.issues[0]?.reason).toBe("unknown-merchant");
  });

  it("does not yet catch a misspelled sku id", () => {
    // Documented limitation, not an oversight: lib/skus.ts imports this module, so
    // checking the id against the catalogue here would be a cycle. Pinned so the gap
    // is visible rather than assumed closed.
    const audit = auditCommerceOverrides(JSON.stringify({
      NOT_A_SKU: { oliveyoung: "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A1" },
    }));
    expect(audit.issues).toEqual([]);
    expect(audit.accepted).toHaveLength(1);
  });

  it("reports unparseable JSON as such rather than as an empty config", () => {
    // Every override is lost here, which must not read the same as "none set".
    const audit = auditCommerceOverrides("{not json");
    expect(audit.configured).toBe(true);
    expect(audit.parsed).toBe(false);
    const unset = auditCommerceOverrides(undefined);
    expect(unset.configured).toBe(false);
    expect(unset.parsed).toBe(true);
  });

  it("still resolves an accepted override through commerceOverrideUrl", () => {
    const good = "https://www.coupang.com/vp/products/1234567890";
    const previous = process.env.COMMERCE_LINK_OVERRIDES_JSON;
    process.env.COMMERCE_LINK_OVERRIDES_JSON = JSON.stringify({ tn1: { coupang: good } });
    try {
      expect(commerceOverrideUrl("tn1", "coupang")).toBe(good);
      expect(commerceOverrideUrl("tn1", "oliveyoung")).toBe(null);
    } finally {
      if (previous === undefined) delete process.env.COMMERCE_LINK_OVERRIDES_JSON;
      else process.env.COMMERCE_LINK_OVERRIDES_JSON = previous;
    }
  });
});

describe("the partnership runbook matches the gate it documents", () => {
  const playbook = readFileSync("docs/commerce-partnership-playbook.md", "utf8");

  it("documents exactly the hosts the code accepts", () => {
    // Bounded to the section: an unbounded split runs to end-of-file, and any later
    // backticked bullet would silently join the list this asserts over.
    const section = (playbook.split("Only HTTPS links on the allowlist are accepted:")[1] ?? "").split("\n#")[0];
    const documented = [...section.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]);
    expect(documented.length).toBeGreaterThan(0);
    for (const host of documented) {
      expect(isAllowedCommerceUrl(`https://${host}/x`), `runbook lists ${host}`).toBe(true);
    }
    // And nothing the code accepts is missing from the runbook.
    for (const host of ["www.oliveyoung.co.kr", "search.shopping.naver.com", "www.coupang.com", "www.google.com"]) {
      expect(documented, `runbook must list ${host}`).toContain(host);
    }
  });

  it("only shows a worked example the gate actually accepts", () => {
    // This is the defect the 2026-09-15 cycle found: the example for naver-shopping
    // was a smartstore.naver.com URL, silently discarded by isAllowedCommerceUrl.
    const block = playbook.split("Example the gate accepts today:")[1]?.split("```")[1] ?? "";
    expect(block, "the runbook must carry a worked example under that heading").toContain("https://");
    const urls = [...block.matchAll(/"(https:\/\/[^"]+)"/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(isAllowedCommerceUrl(url), `runbook example ${url}`).toBe(true);
    }
  });
});
