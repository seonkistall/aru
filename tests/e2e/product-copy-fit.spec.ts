import { expect, test, type Page } from "@playwright/test";

const langs = ["ko", "en", "ja", "zh"] as const;
const viewports = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 393, height: 873 },
  { width: 768, height: 1024 },
] as const;
const routes = ["/", "/scan", "/survey", "/report", "/care", "/checkin", "/studio", "/privacy", "/unsubscribe"] as const;
const survey = {
  type: "복합성",
  concerns: ["모공", "유분"],
  budget: 29000,
  avoid: [],
  category: "토너",
};
const week = 7 * 24 * 60 * 60 * 1000;

type FitResult = {
  corrupt: boolean;
  clipped: string[];
  overflow: number;
  offenders: Array<{
    element: string;
    text: string;
    left: number;
    right: number;
    width: number;
  }>;
  hangul: string[];
};

async function textFitProblems(page: Page, lang: (typeof langs)[number]): Promise<FitResult> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((activeLang) => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.display !== "none"
        && style.visibility !== "hidden";
    };
    const candidates = [...document.querySelectorAll("h1,h2,h3,p,span,a,button,label,summary,td,th")]
      .filter(visible);
    const clipped = candidates
      .filter((element) => {
        const style = getComputedStyle(element);
        const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
        const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
        return (clipsX && element.scrollWidth > element.clientWidth + 1)
          || (clipsY && element.scrollHeight > element.clientHeight + 1);
      })
      .map((element) => element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "")
      .filter(Boolean);
    const rootWidth = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - rootWidth;
    const containedByScroller = (element: Element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden" || overflowX === "clip") return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const offenders = overflow > 1
      ? [...document.querySelectorAll("body *")]
        .filter(visible)
        .filter((element) => !containedByScroller(element))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            element: element.tagName.toLowerCase(),
            text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "",
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter(({ left, right }) => left < -1 || right > rootWidth + 1)
        .slice(0, 8)
      : [];
    const hangul = activeLang === "ko"
      ? []
      : candidates
        .map((element) => element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "")
        .filter((text) => /[가-힣]/.test(text));
    return {
      corrupt: document.body.innerText.includes("\uFFFD"),
      clipped: [...new Set(clipped)],
      overflow,
      offenders,
      hangul: [...new Set(hangul)],
    };
  }, lang);
}

test("consumer copy fits every locale and required viewport", async ({ browser }) => {
  test.setTimeout(600_000);
  const failures: Array<{
    lang: string;
    viewport: string;
    route: string;
    state: string;
    result: FitResult;
  }> = [];

  for (const viewport of viewports) {
    for (const lang of langs) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(({ nextLang, nextSurvey, startedAt }) => {
        localStorage.setItem("aru.lang", nextLang);
        sessionStorage.setItem("gyeol_survey", JSON.stringify(nextSurvey));
        localStorage.setItem("gyeol_purchases", JSON.stringify([{
          id: "copy-fit-use",
          sku_id: "cr3",
          name: "레드 블레미쉬 수분 크림",
          confirmedUse: true,
          ts: startedAt,
        }]));
      }, { nextLang: lang, nextSurvey: survey, startedAt: Date.now() - week });
      const page = await context.newPage();

      const record = async (route: string, state: string) => {
        const result = await textFitProblems(page, lang);
        if (result.corrupt || result.clipped.length || result.overflow > 1 || result.hangul.length) {
          failures.push({
            lang,
            viewport: `${viewport.width}x${viewport.height}`,
            route,
            state,
            result,
          });
        }
      };

      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("lang", lang === "zh" ? "zh-CN" : lang);
        await record(route, "default");

        if (route === "/report") {
          const tabs = page.getByRole("tab");
          for (let index = 1; index < await tabs.count(); index += 1) {
            await tabs.nth(index).click();
            await record(route, `tab-${index}`);
          }
        }

        if (route === "/privacy") {
          await page.locator("details > summary").click();
          await record(route, "details-open");
        }
      }

      await context.close();
    }
  }

  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});
