import { expect, test } from "@playwright/test";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A product started again counts the previous use's check-in as its own.
 *
 * `gyeol_checkins` rows carry `sku_id` and `week` but not the use they answered, and
 * /checkin keeps only the newest use per SKU. It marked a card done when ANY week-N
 * check-in existed for that SKU, so a visitor who answered week 2 for a product, then
 * pressed 이 제품 사용 시작하기 on it again (the button is re-enabled on every /report
 * mount), reached the new use's week 2 to find "남겨주신 피드백을 저장했어요." and no
 * 기록하기 — the round could never be answered. Found by the cycle 114 bug hunt.
 */

type Seed = { firstUseAgo: number; secondUseAgo: number; checkinAgo: number };

async function seed(page: import("@playwright/test").Page, { firstUseAgo, secondUseAgo, checkinAgo }: Seed) {
  await page.addInitScript(
    ({ now, firstUseAgo, secondUseAgo, checkinAgo, day }) => {
      localStorage.setItem("aru.lang", "ko");
      if (localStorage.getItem("gyeol_purchases")) return;
      const use = (id: string, ago: number) => ({
        id,
        sku_id: "cr3",
        name: "레드 블레미쉬 수분 크림",
        confirmedUse: true,
        ts: now - ago * day,
      });
      // Stored oldest first, as recordProductUse appends.
      localStorage.setItem("gyeol_purchases", JSON.stringify([use("use-a", firstUseAgo), use("use-b", secondUseAgo)]));
      localStorage.setItem(
        "gyeol_checkins",
        JSON.stringify([
          { id: "ck-1", sku_id: "cr3", week: 2, satisfaction: 4, trouble: false, repurchase: true, ts: now - checkinAgo * day },
        ])
      );
    },
    { now: Date.now(), firstUseAgo, secondUseAgo, checkinAgo, day: DAY_MS }
  );
}

test("the previous use's week-2 answer does not close the restarted use's week 2", async ({ page }) => {
  // Use A 40 days ago, answered at day 15 (25 days ago); use B started 15 days ago.
  await seed(page, { firstUseAgo: 40, secondUseAgo: 15, checkinAgo: 25 });
  await page.goto("/checkin");

  await expect(page.getByText("2주차")).toBeVisible();
  await expect(page.getByRole("button", { name: "기록하기" })).toBeVisible();
  await expect(page.getByText("남겨주신 피드백을 저장했어요.")).toHaveCount(0);
});

test("a week-2 answer recorded during the current use still closes its round", async ({ page }) => {
  await seed(page, { firstUseAgo: 40, secondUseAgo: 15, checkinAgo: 1 });
  await page.goto("/checkin");

  await expect(page.getByText("2주차")).toBeVisible();
  await expect(page.getByText("남겨주신 피드백을 저장했어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "기록하기" })).toHaveCount(0);
});
