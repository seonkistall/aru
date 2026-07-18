import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
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
    expect(reviewer).toContain("카메라 없이 설문만 할래요");
    expect(reviewer).toContain("내 피부 결, 보러 가기");
    expect(reviewer).toContain("개인정보와 동의");
    expect(reviewer).toContain("`/privacy`");
    expect(home).toContain('t("카메라 없이 설문만 할래요 →")');
    expect(home).toContain('t("내 피부 결, 보러 가기")');
    expect(report).toContain('t("개인정보와 동의")');
    expect(reviewer).not.toContain("설문으로 시작");
    expect(reviewer).not.toContain("카메라로 시작");
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
