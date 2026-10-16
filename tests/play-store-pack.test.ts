import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/en";

const root = resolve(import.meta.dirname, "..");
const HANGUL = /[가-힣]/;
const docs = [
  "listing-ko.md",
  "listing-en.md",
  "data-safety.md",
  "privacy-policy-review.md",
  "content-rating.md",
  "reviewer-instructions.md",
  "release-notes-1.1.0.md",
  "internal-test-checklist.md",
];
const images = [
  "app-icon-512.png",
  "feature-graphic-1024x500.png",
  "phone-01-home.png",
  "phone-02-scan.png",
  "phone-03-report.png",
  "phone-04-routine.png",
];

function file(path: string) {
  return resolve(root, "docs", "play-store", path);
}

function pngSize(path: string) {
  const buffer = readFileSync(path);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Every message id passed to t("…") somewhere under app/ that the English dictionary has. */
function renderedMessageIds() {
  const ids = new Set<string>();
  for (const path of readdirSync(resolve(root, "app"), { recursive: true, encoding: "utf8" })) {
    if (!/\.tsx?$/.test(path)) continue;
    for (const match of readFileSync(resolve(root, "app", path), "utf8").matchAll(/\bt\("([^"]+)"/g)) {
      if (match[1] in EN) ids.add(match[1]);
    }
  }
  return ids;
}

/** Every bold span, written either way Markdown allows (**…** or __…__), hard wraps folded to one space. */
function boldLabels(markdown: string) {
  return [...markdown.matchAll(/(\*\*|__)([\s\S]+?)\1/g)].map((match) => ({
    raw: match[0],
    label: match[2].replace(/\s+/g, " "),
    end: match.index + match[0].length,
  }));
}

function field(markdown: string, heading: string, nextHeading: string) {
  const start = markdown.indexOf(`## ${heading}`);
  const end = markdown.indexOf(`## ${nextHeading}`, start + heading.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return markdown.slice(start + heading.length + 3, end).trim().replace(/^`|`$/g, "");
}

describe("Google Play submission pack", () => {
  it("contains every listing and policy worksheet", () => {
    for (const name of docs) expect(existsSync(file(name)), name).toBe(true);
  });

  it("keeps Korean and English listing copy inside Play limits", () => {
    for (const name of ["listing-ko.md", "listing-en.md"]) {
      const listing = readFileSync(file(name), "utf8");
      const shortDescription = field(listing, "Short description", "Full description");
      const fullDescription = field(listing, "Full description", "Claims checklist");

      expect([...shortDescription].length).toBeLessThanOrEqual(80);
      expect([...shortDescription].length).toBeGreaterThan(20);
      expect([...fullDescription].length).toBeLessThanOrEqual(4000);
      expect([...fullDescription].length).toBeGreaterThan(300);
      expect(`${shortDescription}\n${fullDescription}`).not.toMatch(
        /진단|치료|완치|효과 보장|실시간 가격|제휴 링크|diagnos|treat|cure|guaranteed effect|live price|affiliate link/i,
      );
    }
  });

  it("ships exact store graphics and Play-compatible phone screenshots", () => {
    for (const name of images) expect(existsSync(file(`assets/${name}`)), name).toBe(true);
    expect(pngSize(file("assets/app-icon-512.png"))).toEqual({ width: 512, height: 512 });
    expect(pngSize(file("assets/feature-graphic-1024x500.png"))).toEqual({ width: 1024, height: 500 });

    for (const name of images.filter((image) => image.startsWith("phone-"))) {
      const { width, height } = pngSize(file(`assets/${name}`));
      expect(width).toBeGreaterThanOrEqual(320);
      expect(height).toBeGreaterThanOrEqual(320);
      expect(width).toBeLessThanOrEqual(3840);
      expect(height).toBeLessThanOrEqual(3840);
      expect(Math.max(width, height)).toBeLessThanOrEqual(Math.min(width, height) * 2);
    }
  });

  it("keeps reviewer steps aligned with the production UI labels", () => {
    const reviewer = readFileSync(file("reviewer-instructions.md"), "utf8");
    const home = readFileSync(resolve(root, "app", "page.tsx"), "utf8");
    const report = readFileSync(resolve(root, "app", "report", "page.tsx"), "utf8");
    expect(reviewer).toContain("카메라 없이 설문으로 시작하기");
    expect(reviewer).toContain("내 피부 살펴보기");
    expect(reviewer).toContain("개인정보와 동의");
    expect(reviewer).toContain("`/privacy`");
    expect(home).toContain('t("카메라 없이 설문으로 시작하기")');
    expect(home).toContain('t("내 피부 살펴보기")');
    expect(report).toContain('t("개인정보와 동의")');
    expect(reviewer).not.toContain("설문만 할래요");
    expect(reviewer).not.toContain("카메라로 시작");
  });

  /**
   * The test above only checks that three Korean ids are t("…") calls. Step 6 of the
   * camera path named **AI 분석 전송(선택)**, an id no component renders in any language
   * (the toggle is t("더 자세한 AI 분석")), and nothing checked it. So every bold label
   * must be either a message id rendered through t("…") under app/ or that id's English
   * text from lib/i18n/en.ts.
   *
   * Found by the cycle 122 bug hunt.
   */
  it("bolds only labels the app renders", () => {
    const reviewer = readFileSync(file("reviewer-instructions.md"), "utf8");
    const ids = renderedMessageIds();
    const english = new Set([...ids].map((id) => EN[id]));
    const labels = boldLabels(reviewer).map((bold) => bold.label);

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((label) => !(HANGUL.test(label) ? ids.has(label) : english.has(label)))).toEqual([]);
  });

  // Both checks above and below read labels through boldLabels: either bold syntax, and
  // a label hard-wrapped across lines, must reach them.
  it("finds a bold label written with underscores or wrapped across lines", () => {
    expect(boldLabels("a __AI 분석 전송(선택)__ b **Privacy &\n   consent** c").map((bold) => bold.label)).toEqual(["AI 분석 전송(선택)", "Privacy & consent"]);
  });

  /**
   * The Data safety worksheet said the survey never leaves the device and named the dead
   * AI toggle label. /report sends survey-derived fields to /api/reason on every view
   * (and on to OpenAI while OPENAI_API_KEY is set), so the worksheet must declare that
   * path and must not name a label the app does not render.
   *
   * Found by the cycle 122 bug hunt.
   */
  it("declares the /api/reason survey fields in the Data safety worksheet", () => {
    const worksheet = readFileSync(file("data-safety.md"), "utf8");
    expect(worksheet).toContain("POST /api/reason");
    expect(worksheet).toContain("api.openai.com");
    expect(worksheet).not.toContain("AI 분석 전송(선택)");
    expect(worksheet).not.toMatch(/설문은 기기 밖으로 전송하지 않/);
    expect(worksheet).not.toMatch(/설문 답변[^\n]*브라우저 저장소에만 보관/);
  });

  /**
   * defaultLang() in lib/i18n.tsx returns "en" and nothing reads the device language,
   * so a reviewer on a fresh install sees "Start with the questionnaire", not
   * 카메라 없이 설문으로 시작하기. Each bold label is therefore the English text,
   * followed in parentheses by the Korean id it comes from, for a reviewer who has
   * switched to 한국어.
   *
   * Found by the cycle 122 bug hunt.
   */
  it("leads each label with the English a fresh install shows, Korean in parentheses", () => {
    expect(readFileSync(resolve(root, "lib", "i18n.tsx"), "utf8")).toMatch(/function defaultLang\(\): Lang \{\s*return "en";/);
    const reviewer = readFileSync(file("reviewer-instructions.md"), "utf8");
    const ids = renderedMessageIds();
    const mismatched = boldLabels(reviewer)
      .filter((bold) => {
        const id = /^\s+\(([^)]+)\)/.exec(reviewer.slice(bold.end))?.[1];
        return !id || !ids.has(id) || EN[id] !== bold.label;
      })
      .map((bold) => bold.raw);

    expect(mismatched).toEqual([]);
  });

  it("records the conditional new-personal-account Play gates", () => {
    const checklist = readFileSync(file("internal-test-checklist.md"), "utf8");
    expect(checklist).toContain(
      "2023-11-13 이후 생성된 개인 계정이면 Play Console 모바일 앱에서 실제 Android 기기 접근 검증",
    );
    expect(checklist).toContain(
      "같은 조건의 개인 계정이면 closed test에 12명이 14일 연속 opt-in한 뒤 production access 신청",
    );
    expect(checklist).toContain("16 KB");
  });
});
