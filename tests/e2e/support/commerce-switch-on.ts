/**
 * The owner's revenue switch-on, as a pair of environment variables.
 *
 * `docs/commerce-partnership-playbook.md` tells the owner to set
 * `COMMERCE_LINK_OVERRIDES_JSON` (read on the server, per request) and
 * `NEXT_PUBLIC_COMMERCE_AFFILIATE=on` (inlined into the client bundle at build time) in
 * the same deploy. `tests/commerce.test.ts` covers the parsing of the first one in
 * isolation; nothing exercised the two of them together through a real production
 * server. `tests/e2e/commerce-switch-on.spec.ts` does, and this module is the single
 * place the values live so the spec and `playwright.mobile.config.ts` cannot drift
 * apart — the config puts them in the server's environment, the spec asserts what the
 * server does with them.
 *
 * Everything here is fake on purpose. `DRYRUN000000` is not a goods number and
 * `/a/dryrun` is not a partner link; no affiliate id exists in this repository and none
 * may be invented here. Nothing in the spec ever follows a redirect to either host.
 */

/** Its own port, because the gate's own server must NOT carry these values. */
export const SWITCH_ON_PORT = Number(process.env.COMMERCE_SWITCH_ON_PORT ?? 3104);
export const SWITCH_ON_HOST = "127.0.0.1";
export const SWITCH_ON_BASE_URL = `http://${SWITCH_ON_HOST}:${SWITCH_ON_PORT}`;

/**
 * A second build directory, so the switch-on build and the gate's own build can run at
 * the same time without either clearing the other's output. `next build` empties its
 * `distDir`, and both commands run from this one working tree.
 */
export const SWITCH_ON_DIST_DIR = ".next-switch-on";

/**
 * The server's stdout, mirrored to a file so the spec can read it.
 *
 * Assertion 2 is about something the product deliberately does NOT expose: a rejected
 * override is a `console.warn` from `/api/out` and nothing else. Adding a debug endpoint
 * to read it back would be a product change made for a test, so the spec reads the
 * server's own log instead. Root level, because Playwright empties `test-results/` at the
 * start of a run — after the web servers have already started writing.
 */
export const SWITCH_ON_SERVER_LOG = "commerce-switch-on-server.log";

/** One real catalogue sku. `recommend()` returns it for the survey the spec sets. */
export const SWITCH_ON_SKU = "tn1";

/** On `ALLOWED_HOSTS`, product-detail shaped, and a goods number that cannot exist. */
export const ALLOWLISTED_OVERRIDE =
  "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=DRYRUN000000";

/** NOT on `ALLOWED_HOSTS` — the host 쿠팡 파트너스 links use, which nobody has verified. */
export const BLOCKED_OVERRIDE = "https://link.coupang.com/a/dryrun";

export const SWITCH_ON_OVERRIDES_JSON = JSON.stringify({
  [SWITCH_ON_SKU]: { oliveyoung: ALLOWLISTED_OVERRIDE, coupang: BLOCKED_OVERRIDE },
});

/** Exactly what the playbook tells the owner to set, and nothing else. */
export const SWITCH_ON_ENV: Record<string, string> = {
  COMMERCE_LINK_OVERRIDES_JSON: SWITCH_ON_OVERRIDES_JSON,
  NEXT_PUBLIC_COMMERCE_AFFILIATE: "on",
  ARU_DIST_DIR: SWITCH_ON_DIST_DIR,
};
