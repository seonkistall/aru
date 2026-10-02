import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * `npm run affiliate:check` is the only thing between the owner's first real affiliate
 * links and the silent zero cycle 58 demonstrated: an override on a host that is not in
 * ALLOWED_HOSTS is dropped, /api/out serves the search url instead, and the only trace is
 * one line in a deployed server's request log. These cases run the real script, in a real
 * child process, and assert both what it prints and the exit code — the exit code is what
 * makes it usable before a deploy, so a script that printed the right words and exited 0
 * on a dropped override would be worthless.
 *
 * Every id here is invented. `DRYRUN000000` is not an Olive Young goods number and
 * `/a/dryrun` is not a 파트너스 link, which is the same convention
 * `tests/e2e/commerce-switch-on.spec.ts` uses. The script makes no network request, so
 * nothing below is fetched.
 */
const SCRIPT = "scripts/check-affiliate-overrides.mjs";
const NODE_FLAGS = ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types"];
const ALLOWED = "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=DRYRUN000000";
const COUPANG_LINK = "https://link.coupang.com/a/dryrun";

const workDir = mkdtempSync(path.join(tmpdir(), "aru-affiliate-check-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function run(options: { json?: string; file?: string; args?: string[] } = {}) {
  const env = { ...process.env };
  // The script reads the env var; the suite's own environment must not leak into a case.
  delete env.COMMERCE_LINK_OVERRIDES_JSON;
  if (options.json !== undefined) env.COMMERCE_LINK_OVERRIDES_JSON = options.json;

  const args = [...NODE_FLAGS, SCRIPT, ...(options.file ? [options.file] : []), ...(options.args ?? [])];
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeJson(name: string, body: string) {
  const file = path.join(workDir, name);
  writeFileSync(file, body, "utf8");
  return file;
}

describe("npm run affiliate:check", () => {
  it("prints the exact url a click is redirected to, with all four utm_* parameters", () => {
    const { status, stdout, stderr } = run({ json: JSON.stringify({ tn1: { oliveyoung: ALLOWED } }) });

    expect(stderr).toBe("");
    expect(stdout).toContain("tn1/oliveyoung  ACCEPTED");
    expect(stdout).toContain(`supplied: ${ALLOWED}`);
    // Not a substring check on the whole line: the url is parsed back out of the report so
    // the assertion is on what a visitor's browser would actually receive.
    const redirect = /^ {2}redirect: (\S+)$/m.exec(stdout)?.[1] ?? "";
    const url = new URL(redirect);
    expect(url.origin + url.pathname).toBe("https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do");
    expect(url.searchParams.get("goodsNo")).toBe("DRYRUN000000");
    expect(url.searchParams.get("utm_source")).toBe("kbeauty_ai_camera");
    expect(url.searchParams.get("utm_medium")).toBe("commerce_link");
    expect(url.searchParams.get("utm_campaign")).toBe("skin_scan_recommendation");
    expect(url.searchParams.get("utm_content")).toBe("report_summary_tn1_oliveyoung");
    expect(status).toBe(0);
  });

  it("warns that the redirect is not the url the owner supplied, and names the blocker", () => {
    const { stdout } = run({ json: JSON.stringify({ tn1: { oliveyoung: ALLOWED } }) });

    expect(stdout).toContain("WARNING:");
    expect(stdout).toContain("ARU appended tracking parameters");
    expect(stdout).toContain("utm_*` parameters break affiliate attribution");
    expect(stdout).toContain("docs/AUTOPILOT.md");
    expect(stdout).toContain("1 accepted, 0 ignored, 1 with appended tracking parameters.");
  });

  it("--placement changes only utm_content, never which url is chosen", () => {
    const { stdout } = run({
      json: JSON.stringify({ tn1: { oliveyoung: ALLOWED } }),
      args: ["--placement=report_product"],
    });

    const redirect = /^ {2}redirect: (\S+)$/m.exec(stdout)?.[1] ?? "";
    expect(new URL(redirect).searchParams.get("utm_content")).toBe("report_product_tn1_oliveyoung");
    expect(new URL(redirect).searchParams.get("goodsNo")).toBe("DRYRUN000000");
  });

  it("ignores a link.coupang.com override with the server's own sentence, and exits non-zero", () => {
    // The host 쿠팡 파트너스 is REPORTED to issue links on, and it is not on ALLOWED_HOSTS.
    // This is the case that earns $0 with nothing visibly wrong.
    const { status, stdout } = run({ json: JSON.stringify({ tn1: { coupang: COUPANG_LINK } }) });

    expect(status).toBe(1);
    expect(stdout).toContain("tn1/coupang  IGNORED — the URL is not an https URL on the allowlist");
    expect(stdout).toContain("none — /api/out keeps the marketplace search url for this merchant.");
    // Verbatim, so the owner can match this against a deployed server's request log.
    expect(stdout).toContain(
      `[commerce] override for tn1/coupang ignored: the URL is not an https URL on the allowlist (www.oliveyoung.co.kr, search.shopping.naver.com, www.coupang.com, www.google.com) (${COUPANG_LINK}). The link is still a search URL.`
    );
    expect(stdout).toContain("0 accepted, 1 ignored");
  });

  it("still exits non-zero when one override is accepted and another is ignored", () => {
    // A non-zero exit only on an all-bad blob would pass the case above and still let the
    // owner deploy a half-broken switch-on.
    const file = writeJson("mixed.json", JSON.stringify({ tn1: { oliveyoung: ALLOWED, coupang: COUPANG_LINK } }));
    const { status, stdout } = run({ file });

    expect(status).toBe(1);
    expect(stdout).toContain("tn1/oliveyoung  ACCEPTED");
    expect(stdout).toContain("tn1/coupang  IGNORED");
    expect(stdout).toContain("1 accepted, 1 ignored, 1 with appended tracking parameters.");
  });

  it("reads a file path argument, and never reports the env var as its source", () => {
    const file = writeJson("clean.json", JSON.stringify({ tn1: { oliveyoung: ALLOWED } }));
    const { status, stdout } = run({ file });

    expect(status).toBe(0);
    expect(stdout).toContain(`source:    ${file}`);
    expect(stdout).not.toContain("$COMMERCE_LINK_OVERRIDES_JSON");
  });

  it("reports malformed JSON as every override lost, not as nothing configured", () => {
    const file = writeJson("broken.json", "{not json");
    const { status, stdout } = run({ file });

    expect(status).toBe(1);
    expect(stdout).toContain("[commerce] COMMERCE_LINK_OVERRIDES_JSON is not valid JSON — every override is being ignored.");
    expect(stdout).toContain("EVERY override is lost");
    expect(stdout).not.toContain("ACCEPTED");
    expect(stdout).not.toContain("Nothing configured");
  });

  it("reports an empty environment as not a switch-on, and exits non-zero", () => {
    const { status, stdout } = run({});

    expect(status).toBe(1);
    expect(stdout).toContain("Nothing configured.");
    expect(stdout).toContain("no affiliate link is live");
    expect(stdout).not.toContain("ACCEPTED");
    expect(stdout).not.toContain("is not valid JSON");
  });

  it("names a misspelled sku id and merchant key, which /api/out never looks up at all", () => {
    const file = writeJson(
      "keys.json",
      JSON.stringify({ NOT_A_SKU: { oliveyoung: ALLOWED }, tn1: { oliveyung: ALLOWED } })
    );
    const { status, stdout } = run({ file });

    expect(status).toBe(1);
    expect(stdout).toContain('NOT_A_SKU/oliveyoung  IGNORED — "NOT_A_SKU" is not a sku id in the catalogue');
    expect(stdout).toContain("none — /api/out answers 404 for a sku id that is not in the catalogue");
    expect(stdout).toContain('tn1/oliveyung  IGNORED — "oliveyung" is not a merchant id');
    expect(stdout).toContain("this key is never read");
    // Neither bad key may ever be presented as a working redirect.
    expect(stdout).not.toContain("utm_source=kbeauty_ai_camera");
  });

  it("checks the sku half against the real catalogue, so the ids above are not just unknown strings", () => {
    // The case above would also pass if the script rejected every sku id. `tn1` resolving
    // is the other half of that check.
    const { stdout } = run({ json: JSON.stringify({ tn1: { oliveyoung: ALLOWED } }) });
    expect(stdout).toMatch(/^catalogue: \d+ sku ids from lib\/skus\.ts$/m);
    expect(stdout).toContain("tn1/oliveyoung  ACCEPTED");
  });

  it("makes no network request: no fetch, no http module, in the script's own source", () => {
    // The script resolves a 쿠팡 link and an Olive Young link; fetching either one would
    // register a click with a programme from a laptop running a pre-deploy check.
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/node:(http|https|net|dns)\b/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
  });
});
