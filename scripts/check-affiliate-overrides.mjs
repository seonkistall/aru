// What /api/out will actually send a visitor to, for every override in
// COMMERCE_LINK_OVERRIDES_JSON — before the deploy, not after it.
//
//   npm run affiliate:check                      # reads the env var
//   npm run affiliate:check -- overrides.json    # reads a file instead
//   npm run affiliate:check -- overrides.json --placement=report_product
//
// Three silent-zero failures this exists to catch, all of them invisible today until
// someone reads the request log of a deployed server:
//   1. An override on a host that is not in ALLOWED_HOSTS is dropped and the search URL
//      is served instead (cycle 58 proved it on a production server).
//   2. A misspelled sku id or merchant key never matches the lookup, so it is the same
//      no-op as a missing override.
//   3. addCommerceTracking() appends four utm_* parameters to the owner's real tracking
//      link, so the visitor does not land on the URL the owner pasted. Whether that
//      breaks attribution is an open owner question — see BLOCKERS in docs/AUTOPILOT.md.
//
// READ-ONLY. It changes nothing, and it NEVER fetches a URL: no request leaves the
// machine, so running it cannot register a click with any programme.
//
// It imports lib/commerce.ts and lib/skus.ts directly rather than copying the allowlist
// or the tracking, because a copy would pass this check and still be wrong. Node strips
// the types (--experimental-strip-types, in the npm script); the resolve hook below is
// only there because the repo's TS imports are extensionless ("./commerce"), which
// Node's own ESM resolver will not follow.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && context.parentURL) {
        const candidate = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
      }
      throw error;
    }
  },
});

const { addCommerceTracking, auditCommerceOverrides, commerceOverrideUrl, describeCommerceOverrideIssue, MERCHANT_IDS } =
  await import("../lib/commerce.ts");
const { SKUS } = await import("../lib/skus.ts");

const BLOCKER = 'the BLOCKERS item "Whether ARU\'s own `utm_*` parameters break affiliate attribution" in docs/AUTOPILOT.md';

const args = process.argv.slice(2);
const placementArg = args.find((arg) => arg.startsWith("--placement="));
// report_summary is what app/report/page.tsx:458 passes for the top pick. It only ever
// changes utm_content, never which URL is chosen.
const placement = placementArg ? placementArg.slice("--placement=".length) : "report_summary";
const filePath = args.find((arg) => !arg.startsWith("--"));

function readSource() {
  if (filePath) {
    const raw = readFileSync(filePath, "utf8").trim();
    // commerceOverrideUrl() reads the env var itself — that is the code path /api/out
    // takes, so the file is loaded into it rather than resolved some other way.
    process.env.COMMERCE_LINK_OVERRIDES_JSON = raw;
    return { raw, where: filePath };
  }
  return { raw: process.env.COMMERCE_LINK_OVERRIDES_JSON, where: "$COMMERCE_LINK_OVERRIDES_JSON" };
}

// lib/commerce.ts logs its rejections through console.warn, once per distinct env value.
// Collecting them keeps this report one ordered stream instead of two interleaved ones,
// and lets the rows below quote the server's own sentences rather than new ones.
function capturingWarnings(run) {
  const lines = [];
  const original = console.warn;
  console.warn = (...parts) => lines.push(parts.join(" "));
  try {
    run();
  } finally {
    console.warn = original;
  }
  return lines;
}

// Why an ignored row sends a visitor nowhere, read off app/api/out/route.ts rather than
// guessed: an unknown sku id never gets past the SKUS.find() at route.ts:12-17, and an
// unknown merchant key is never what route.ts:10 reads off the query string, so neither
// key is ever looked up by a real click. Only the blocked-host row is a lookup that
// happens and returns null, so only that one is worth probing for real.
function noRedirectBecause(sku, merchant, issue) {
  if (issue.reason === "unknown-sku") {
    return "none — /api/out answers 404 for a sku id that is not in the catalogue, so no click reaches this override.";
  }
  if (issue.reason === "unknown-merchant") {
    return "none — /api/out only ever looks up a real merchant id, so this key is never read and the sku keeps its search urls.";
  }
  const resolved = commerceOverrideUrl(sku, merchant, { knownSkus });
  return resolved === null
    ? "none — /api/out keeps the marketplace search url for this merchant."
    : resolved;
}

const knownSkus = SKUS.map((sku) => sku.id);
const { raw, where } = readSource();

console.log("affiliate:check — the same functions /api/out uses, no network request.");
console.log(`source:    ${where}`);
console.log(`placement: ${placement}`);
console.log(`catalogue: ${knownSkus.length} sku ids from lib/skus.ts`);
console.log("");

if (!raw) {
  console.log("Nothing configured. COMMERCE_LINK_OVERRIDES_JSON is unset or empty, so /api/out");
  console.log("serves the marketplace SEARCH url for every sku and no affiliate link is live.");
  console.log("That is a correct state to ship, but it is not a switch-on — so this exits 1.");
  process.exit(1);
}

const audit = auditCommerceOverrides(raw, { knownSkus });

// One call flushes every line /api/out would write for this env value, including the
// not-valid-JSON line, because the module warns once per distinct value and not per row.
const firstSku = audit.accepted[0]?.sku ?? audit.issues[0]?.sku ?? "";
const firstMerchant = audit.accepted[0]?.merchant ?? audit.issues[0]?.merchant ?? MERCHANT_IDS[0];
const serverLog = capturingWarnings(() => {
  commerceOverrideUrl(firstSku, firstMerchant, { knownSkus });
});

if (serverLog.length) {
  console.log("What the deployed server writes to its log, verbatim:");
  for (const line of serverLog) console.log(`  ${line}`);
  console.log("");
}

if (!audit.parsed) {
  console.log("COMMERCE_LINK_OVERRIDES_JSON is not parseable JSON, so EVERY override is lost and");
  console.log("/api/out serves the search url for every sku. Fix the JSON and run this again.");
  process.exit(1);
}

const acceptedBy = new Map(audit.accepted.map((row) => [`${row.sku}\u0000${row.merchant}`, row]));
const issueBy = new Map(audit.issues.map((row) => [`${row.sku}\u0000${row.merchant}`, row]));

let accepted = 0;
let ignored = 0;
let retagged = 0;

for (const [sku, byMerchant] of Object.entries(JSON.parse(raw) || {})) {
  for (const [merchant, value] of Object.entries(byMerchant || {})) {
    const key = `${sku}\u0000${merchant}`;
    const acceptedRow = acceptedBy.get(key);
    const issue = issueBy.get(key);

    if (!acceptedRow && !issue) {
      // auditCommerceOverrides skips a value that is not a non-empty string, and the
      // server logs nothing at all for it — the quietest of the three failures.
      ignored += 1;
      console.log(`${sku}/${merchant}  IGNORED — the value is not a non-empty string (${JSON.stringify(value)})`);
      console.log("  redirect: none, and the server log stays silent about this row.");
      console.log("");
      continue;
    }

    if (issue) {
      ignored += 1;
      console.log(`${sku}/${merchant}  IGNORED — ${describeCommerceOverrideIssue(issue)}`);
      console.log(`  supplied: ${value}`);
      console.log(`  redirect: ${noRedirectBecause(sku, merchant, issue)}`);
      console.log("");
      continue;
    }

    accepted += 1;
    const resolved = commerceOverrideUrl(sku, merchant, { knownSkus });
    const target = addCommerceTracking(resolved, { sku, merchant, placement });
    console.log(`${sku}/${merchant}  ACCEPTED`);
    console.log(`  supplied: ${value}`);
    console.log(`  redirect: ${target}`);
    if (target !== value) {
      retagged += 1;
      console.log("  WARNING:  ARU appended tracking parameters, so a visitor does NOT land on the url");
      console.log("            you supplied. 올리브영 and 네이버 are reported to refuse credit for a");
      console.log("            modified link, which would earn $0 with nothing visibly wrong. See");
      console.log(`            ${BLOCKER}.`);
    }
    console.log("");
  }
}

console.log(`${accepted} accepted, ${ignored} ignored, ${retagged} with appended tracking parameters.`);
if (ignored) {
  console.log("An ignored override is not an error at runtime: /api/out falls back to the search url");
  console.log("and only the server log says so. Fix every ignored row before deploying.");
}
if (!accepted) {
  console.log("No override resolves, so no affiliate link would be live in this deploy.");
}
process.exit(ignored || !accepted ? 1 : 0);
