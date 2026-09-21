#!/usr/bin/env node
/**
 * What it takes to reach $10,000/month, per revenue architecture.
 *
 * Why this is a script and not a paragraph: `docs/AUTOPILOT.md` has carried a revenue
 * table since 2026-09-15 whose basket figure does not follow from the source it cites,
 * and nothing re-derived it for 20 cycles. Arithmetic in a committed script gets
 * re-run; arithmetic in prose gets copied.
 *
 *   node scripts/revenue-model.mjs
 *
 * READ THIS BEFORE QUOTING ANY NUMBER IT PRINTS. Two kinds of input go in:
 *
 *   MEASURED   the catalogue price band, read out of lib/skus.ts at run time.
 *   ASSUMED    every conversion rate, and every commission rate. None of them has
 *              been verified against a primary source from this network, and the
 *              conversion rates have never been measured for this product because
 *              this product has never had traffic. They are labelled at the point of
 *              use and the output repeats the label.
 *
 * So the outputs are exact arithmetic over stated guesses. That is useful for ranking
 * architectures against each other — the ranking is robust to the guesses being off by
 * a factor — and useless as a forecast. Do not put a number from here in front of an
 * investor without the assumption block next to it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_USD = 10_000;
/** ASSUMED. Mid-September 2026 was near ₩1,350-1,400/USD; 1,380 is the round figure
 *  used throughout. Every USD figure below moves inversely with this. */
const KRW_PER_USD = 1380;

/** MEASURED: every `price:` literal in the catalogue. */
function cataloguePrices() {
  const src = readFileSync(resolve(ROOT, "lib/skus.ts"), "utf8");
  const prices = [...src.matchAll(/^\s*price:\s*(\d+),/gm)].map((m) => Number(m[1]));
  if (!prices.length) throw new Error("no prices found in lib/skus.ts — did the field name change?");
  return prices.sort((a, b) => a - b);
}

const median = (xs) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
const won = (n) => `₩${Math.round(n).toLocaleString("en-US")}`;
const usd = (n) => `$${n.toFixed(2)}`;
const int = (n) => Math.round(n).toLocaleString("en-US");

/** ASSUMED commission rates. Source column says where the figure came from, and every
 *  one of them is a search result rather than a page this repository opened — Korean
 *  commerce hosts refuse this network (see BLOCKERS in docs/AUTOPILOT.md). */
const PROGRAMMES = [
  { id: "oliveyoung", name: "올리브영 쇼핑 큐레이터", rate: 0.07, note: "7% on a recommended item; 3% on anything else bought through the link" },
  { id: "naver", name: "네이버 쇼핑 커넥트", rate: 0.05, note: "5-28% per product; 5% is the bottom of the stated band" },
  { id: "coupang", name: "쿠팡 파트너스", rate: 0.03, note: "sources disagree (3% / 1-3% / 5%); 3% is the conservative read" },
];

/**
 * ASSUMED. No measurement exists for this product; this is the band
 * docs/AUTOPILOT.md has carried, kept so the model stays comparable to it.
 *
 * Read it as scan -> **BUYER**, not scan -> purchase, and the distinction is load
 * bearing. Under architecture A one buyer makes one purchase and the two readings
 * coincide. Under B a buyer makes `purchasesPerYear` of them, so the same 2-5% band
 * implies a 6-15% scan -> purchase rate — a stronger assumption than the one this
 * band was inherited under, and the whole reason B needs 3x fewer scans. It may well
 * be right, since buying more is what retention means, but it is an assumption and
 * not arithmetic, so it is named here rather than left in the gap between two
 * variables.
 */
const SCAN_TO_BUYER = { low: 0.02, high: 0.05 };

/** ASSUMED. Skincare is consumable, so one acquired user can buy more than once.
 *  `purchasesPerYear` is how many times a retained user buys through ARU in a year. */
const ARCHITECTURES = [
  {
    id: "A",
    name: "Affiliate, one purchase per user (what ships today)",
    purchasesPerYear: 1,
    why: "Nothing in the product asks a user to buy a second time. /checkin collects a 재구매 answer and does not act on it.",
  },
  {
    id: "B",
    name: "Affiliate + replenishment via the check-in loop",
    purchasesPerYear: 3,
    why: "A toner or serum lasts roughly 2-3 months, so a retained user has ~4 replenishment moments a year; 3 assumes one is missed. The 2-week and 4-week check-ins and the reminder email already exist.",
  },
];

function report() {
  const prices = cataloguePrices();
  const med = median(prices);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;

  console.log("=".repeat(78));
  console.log("ARU revenue model — what $10,000/month requires");
  console.log("=".repeat(78));

  console.log("\n## MEASURED: the catalogue basket (lib/skus.ts)\n");
  console.log(`  SKUs                 : ${prices.length}`);
  console.log(`  price range          : ${won(prices[0])} - ${won(prices[prices.length - 1])}`);
  console.log(`  mean                 : ${won(mean)}`);
  console.log(`  median               : ${won(med)}`);
  console.log(`\n  docs/AUTOPILOT.md states ~₩30,000 and cites "catalogue price band in lib/skus.ts".`);
  console.log(`  The median of that band is ${won(med)}. A ₩30,000 basket needs ~1.5 items, which is a`);
  console.log(`  different assumption than the one the table credits. Both are modelled below.`);

  const baskets = [
    { label: "1 item at the catalogue median", value: med },
    { label: "the figure docs/AUTOPILOT.md carries", value: 30_000 },
  ];

  console.log("\n## Revenue per converted click (ASSUMED rates x MEASURED basket)\n");
  console.log(`  ${"basket".padEnd(34)} ${"programme".padEnd(22)} ${"per conversion".padStart(16)}`);
  console.log(`  ${"-".repeat(34)} ${"-".repeat(22)} ${"-".repeat(16)}`);
  for (const basket of baskets) {
    for (const p of PROGRAMMES) {
      const krw = basket.value * p.rate;
      console.log(`  ${basket.label.padEnd(34)} ${p.name.padEnd(22)} ${(`${won(krw)} / ${usd(krw / KRW_PER_USD)}`).padStart(16)}`);
    }
  }

  console.log("\n## What $10,000/month requires, per architecture\n");
  console.log("  Steady state, so the arithmetic is: a cohort of A new buyers acquired each");
  console.log("  month yields p purchases each over a year, and twelve overlapping cohorts");
  console.log("  make monthly purchases = A x p. So A = purchases needed / p, and new scans");
  console.log("  = A / scan->buyer rate. Architecture B reuses buyers, so it needs fewer");
  console.log("  new scans for the same revenue — that is the whole point of it.");
  console.log("  Steady state is not month one. A's purchase happens at the scan, so month 1");
  console.log("  already earns the steady-state figure; B's first purchase does too and its");
  console.log("  replenishments arrive over the following year, so B's month 1 is ~1/p of");
  console.log("  steady state and the tail takes a year to fill in.\n");

  const basket = med; // the conservative, measured one
  for (const p of PROGRAMMES) {
    const perConversion = (basket * p.rate) / KRW_PER_USD;
    console.log(`  ${p.name} — ${usd(perConversion)} per conversion, basket ${won(basket)}`);
    for (const arch of ARCHITECTURES) {
      const purchasesNeeded = TARGET_USD / perConversion;
      const newBuyers = purchasesNeeded / arch.purchasesPerYear;
      const scansLow = newBuyers / SCAN_TO_BUYER.high;
      const scansHigh = newBuyers / SCAN_TO_BUYER.low;
      console.log(
        `     ${arch.id}  purchases/mo ${int(purchasesNeeded).padStart(7)}   new buyers/mo ${int(newBuyers).padStart(7)}` +
        `   new scans/mo ${int(scansLow).padStart(8)} - ${int(scansHigh).padStart(8)}`
      );
    }
    console.log("");
  }

  console.log("## The same question asked backwards\n");
  console.log("  If ARU gets N scans a month, what does each architecture earn?");
  console.log("  Basket = catalogue median, programme = 올리브영 at 7%, scan->buyer 2-5%.\n");
  const perConversion = (basket * 0.07) / KRW_PER_USD;
  console.log(`  ${"scans/mo".padStart(10)} ${"A: one purchase".padStart(22)} ${"B: replenishment".padStart(22)}`);
  console.log(`  ${"-".repeat(10)} ${"-".repeat(22)} ${"-".repeat(22)}`);
  for (const scans of [1_000, 10_000, 50_000, 100_000, 500_000]) {
    const cells = ARCHITECTURES.map((arch) => {
      const lo = scans * SCAN_TO_BUYER.low * arch.purchasesPerYear * perConversion;
      const hi = scans * SCAN_TO_BUYER.high * arch.purchasesPerYear * perConversion;
      return `${usd(lo)} - ${usd(hi)}`.padStart(22);
    });
    console.log(`  ${int(scans).padStart(10)} ${cells.join(" ")}`);
  }

  console.log("\n## The number that decides the marketing plan: what one scan is worth\n");
  console.log("  Revenue per NEW SCAN, which is the most a channel could cost per user");
  console.log("  before it loses money — and that is the ceiling at 100% margin, ignoring");
  console.log("  every cost ARU also has. A usable bid is a fraction of it.\n");
  console.log(`  ${"architecture".padEnd(34)} ${"per scan".padStart(18)} ${"per 1,000 scans".padStart(18)}`);
  console.log(`  ${"-".repeat(34)} ${"-".repeat(18)} ${"-".repeat(18)}`);
  for (const arch of ARCHITECTURES) {
    const lo = SCAN_TO_BUYER.low * arch.purchasesPerYear * perConversion;
    const hi = SCAN_TO_BUYER.high * arch.purchasesPerYear * perConversion;
    console.log(
      `  ${`${arch.id}: ${arch.purchasesPerYear} purchase/user/yr`.padEnd(34)}` +
      ` ${`${usd(lo)} - ${usd(hi)}`.padStart(18)} ${`${usd(lo * 1000)} - ${usd(hi * 1000)}`.padStart(18)}`
    );
  }
  console.log("\n  Any paid channel — search ads, social ads, influencer CPM — costs far more");
  console.log("  per acquired user than the top of that band. So paid acquisition is not a");
  console.log("  lever ARU can pull at any spend level, and the marketing plan has to be");
  console.log("  organic and referral only. That conclusion is arithmetic, not taste.");

  console.log("\n## Architectures this model does NOT rank, and why\n");
  console.log("  C  Brand-side placement. A brand pays for position in the recommendation.");
  console.log("     A handful of deals rather than ~10,000 purchases, so it is the only");
  console.log("     architecture on this page that reaches the target at ARU's plausible");
  console.log("     traffic. How many is unknown: no Korean beauty placement rate card was");
  console.log("     reachable from this network, so a per-deal figure here would be invented.");
  console.log("     It is not modelled because its price is negotiated, not computed,");
  console.log("     and because a paid position inside a recommendation the product calls");
  console.log("     personalised is a disclosure problem before it is a revenue one.");
  const SUB_PRICE_KRW = 4900;
  console.log(`  D  Subscription. ${int((TARGET_USD * KRW_PER_USD) / SUB_PRICE_KRW)} paying users at ${won(SUB_PRICE_KRW)}/mo. Needs a PG`);
  console.log("     contract, recurring-billing compliance and a refund path — none of which");
  console.log("     exist, and none of which a code cycle can create.");

  console.log("\n" + "=".repeat(78));
  console.log("Every conversion and commission rate above is ASSUMED and unverified.");
  console.log("The catalogue basket is measured. The arithmetic is exact. The forecast is not.");
  console.log("=".repeat(78));
}

report();
