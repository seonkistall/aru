import { expect, test } from "@playwright/test";

/**
 * Cycle 32 shape-checked `gyeol_survey` at its three reads. In the SAME functions
 * (`loadInitialView` in `app/report/page.tsx`, `loadCareView` in `app/care/page.tsx`)
 * the `gyeol_reads` and `gyeol_scan` values are still `JSON.parse`d with no shape
 * check, and so are the two reads in `app/survey/page.tsx` and the one in
 * `app/studio/page.tsx`.
 *
 * This spec measures what each wrong shape actually does on each screen BEFORE any
 * guard is added, rather than assuming they all break: `/report` renders `reads.oil.value`,
 * `reads.overall`, `reads.headline` and `reads.confidence` directly, while `/care` hands
 * `reads` to `careSummary`, which ignores it. Only what actually breaks is guarded.
 */

const READS_KEY = "gyeol_reads";
const SCAN_KEY = "gyeol_scan";
const SURVEY_KEY = "gyeol_survey";
const LAST_RESULT_KEY = "aru_last_result";

// A structurally complete SkinReads, used both as the control case (it must still
// render) and as the base every "one field wrong" case below is built from.
const VALID_READS = {
  oil: { value: "유분 적정", level: 0, calm: true },
  pores: { value: "모공 보통", level: 1, calm: false },
  redness: { value: "붉은기 낮음", level: 0, calm: true },
  overall: { value: "전반 안정", level: 0, calm: true },
  headline: "오늘 피부는 안정적이에요",
  narrative: "전반적으로 안정적이에요.",
  confidence: 0.82,
  confidenceLabel: "보통",
  retakeRecommended: false,
  retakeReasons: [],
  signals: [{ label: "빛", ok: true, detail: "빛 충분" }],
  source: "roi-calibrated",
  raw: {},
};
const valid = (patch: Record<string, unknown>) => JSON.stringify({ ...VALID_READS, ...patch });

const VALID_SURVEY = '{"type":"지성","concerns":["모공"],"budget":30000,"avoid":[],"category":"토너"}';

// Valid JSON every one, so the try/catch at the read never sees them.
const WRONG_READS: [string, string][] = [
  ["a number", "5"],
  ["a string", '"abcdef"'],
  ["an empty object", "{}"],
  ["a boolean", "true"],
  ["an array", "[]"],
  ["reads whose oil is a string", '{"oil":"많음","pores":"많음","redness":"많음","overall":"보통","headline":"h","confidence":0.8}'],
  ["reads with oil only", '{"oil":{"value":"유분 적정","calm":true,"level":0}}'],
  ["reads whose overall is missing", '{"oil":{"value":"a","calm":true,"level":0},"pores":{"value":"b","calm":true,"level":0},"redness":{"value":"c","calm":true,"level":0},"headline":"h","confidence":0.8}'],
  ["reads whose signals hold a number", valid({ signals: [5] })],
  ["reads whose extras hold a number", valid({ extras: [5] })],
  ["reads whose retakeReasons hold a number", valid({ retakeReasons: [5] })],
  ["reads whose source is not one of the three", valid({ source: "made-up" })],
];

const ERROR_BOUNDARY = "앗, 잠깐 멈췄어요";

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

// Runs in the page before any script: seeds the locale and the sessionStorage keys
// under test, so the mount effect reads them on its first pass.
function seedStores(payload: unknown) {
  localStorage.setItem("aru.lang", "ko");
  for (const [key, value] of payload as [string, string][]) sessionStorage.setItem(key, value);
}

for (const [name, raw] of WRONG_READS) {
  test(`/report survives a reads store holding ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(seedStores, [[SURVEY_KEY, VALID_SURVEY], [READS_KEY, raw]] as [string, string][]);
    const page = await context.newPage();
    await page.goto("/report");
    await settle(page);

    await expect(page.getByText(ERROR_BOUNDARY), `/report fell into app/error.tsx on ${name}`).toHaveCount(0);
    // The page still has to be the report: its picks step is the whole paying path.
    await expect(page.getByRole("tab", { name: /살펴볼 제품 후보/ }), `/report lost its report shell on ${name}`).toBeVisible();

    await context.close();
  });

  test(`/care still offers its merchant path when the reads store holds ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(seedStores, [[SURVEY_KEY, VALID_SURVEY], [READS_KEY, raw]] as [string, string][]);
    const page = await context.newPage();
    await page.goto("/care");
    await settle(page);

    await expect(page.getByText(ERROR_BOUNDARY), `/care fell into app/error.tsx on ${name}`).toHaveCount(0);

    await context.close();
  });

  test(`/studio prefills or falls back when the reads store holds ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(seedStores, [[READS_KEY, raw]] as [string, string][]);
    const page = await context.newPage();
    await page.goto("/studio");
    await settle(page);

    await expect(page.getByText(ERROR_BOUNDARY), `/studio fell into app/error.tsx on ${name}`).toHaveCount(0);

    await context.close();
  });
}

// The same wrong shapes under gyeol_scan, which /report and /care hand to recommend().
const WRONG_SCAN: [string, string][] = [
  ["a number", "5"],
  ["a string", '"abcdef"'],
  ["an empty object", "{}"],
  ["a boolean", "true"],
  ["an array", "[]"],
  ["a scan whose oil is a string", '{"oil":"x","redness":0,"pores":0}'],
];

for (const [name, raw] of WRONG_SCAN) {
  test(`/report survives a scan store holding ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(seedStores, [[SURVEY_KEY, VALID_SURVEY], [SCAN_KEY, raw]] as [string, string][]);
    const page = await context.newPage();
    await page.goto("/report");
    await settle(page);

    await expect(page.getByText(ERROR_BOUNDARY), `/report fell into app/error.tsx on scan ${name}`).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /살펴볼 제품 후보/ }), `/report lost its report shell on scan ${name}`).toBeVisible();

    await context.close();
  });

  test(`/survey survives a scan store holding ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await context.addInitScript(seedStores, [[SCAN_KEY, raw]] as [string, string][]);
    const page = await context.newPage();
    await page.goto("/survey");
    await settle(page);

    await expect(page.getByText(ERROR_BOUNDARY), `/survey fell into app/error.tsx on scan ${name}`).toHaveCount(0);

    await context.close();
  });
}

// What /report mirrors on the way past: loadLastResult feeds `reads` straight back to
// /report's fresh-tab fallback and to /studio's prefill, with no sessionStorage at all.
test("/report survives the mirrored copy a bad reads store left in localStorage", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(
    ([lastResultKey, survey]) => {
      localStorage.setItem("aru.lang", "ko");
      localStorage.setItem(
        lastResultKey as string,
        `{"survey":${survey as string},"scan":null,"reads":5,"ts":1758600000000}`,
      );
    },
    [LAST_RESULT_KEY, VALID_SURVEY] as const,
  );
  const page = await context.newPage();
  await page.goto("/report");
  await settle(page);

  await expect(page.getByText(ERROR_BOUNDARY), "/report fell into app/error.tsx on a mirrored bad reads").toHaveCount(0);
  await expect(page.getByRole("tab", { name: /살펴볼 제품 후보/ })).toBeVisible();

  await context.close();
});

test("/report does not mirror a wrong-shaped reads into localStorage", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedStores, [[SURVEY_KEY, VALID_SURVEY], [READS_KEY, "5"]] as [string, string][]);
  const page = await context.newPage();
  await page.goto("/report");
  await settle(page);

  // The mirror is written from an effect, and a locale chunk landing remounts the
  // subtree and runs it again, so two animation frames after `goto` is not a
  // guarantee that it has run once. Poll for the write rather than assume it; if it
  // never happens this still fails, with the same message.
  await page
    .waitForFunction((key) => localStorage.getItem(key as string) !== null, LAST_RESULT_KEY, { timeout: 10_000 })
    .catch(() => {});
  const mirrored = await page.evaluate((key) => localStorage.getItem(key as string), LAST_RESULT_KEY);
  expect(mirrored, "nothing was saved at all").not.toBeNull();
  const parsed = JSON.parse(mirrored as string) as { reads: unknown };
  expect(parsed.reads, "/report mirrored a wrong-shaped reads into aru_last_result").toBeNull();

  await context.close();
});

// Control: the same three screens on a structurally complete reads. If a guard ever
// rejects a real reading, this is what fails.
test("/report renders the scan headline on a structurally complete reads", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedStores, [
    [SURVEY_KEY, VALID_SURVEY],
    [READS_KEY, JSON.stringify(VALID_READS)],
  ] as [string, string][]);
  const page = await context.newPage();
  await page.goto("/report");
  await settle(page);

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: VALID_READS.headline })).toBeVisible();

  await context.close();
});

test("/studio prefills from a structurally complete reads", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(seedStores, [[READS_KEY, JSON.stringify(VALID_READS)]] as [string, string][]);
  const page = await context.newPage();
  await page.goto("/studio");
  await settle(page);

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await expect(page.getByText(VALID_READS.oil.value).first()).toBeVisible();

  await context.close();
});
