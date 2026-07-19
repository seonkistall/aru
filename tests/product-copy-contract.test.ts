import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("ARU consumer product copy", () => {
  it("uses the approved Home journey", () => {
    const home = source("app/page.tsx");
    for (const phrase of [
      "나에게 맞는 화장품 찾기,",
      "30초면 충분해요.",
      "오늘의 내 피부,",
      "어떤 스킨케어가 좋을까요?",
      "AI 카메라로 지금 피부에 맞는 제품과 루틴을 함께 찾아봐요.",
      "내 피부 살펴보기",
      "카메라 없이 설문으로 시작하기",
      "사진은 기기에서 확인하고, 동의 없이 저장하지 않아요.",
    ]) {
      expect(home).toContain(phrase);
    }
  });

  it("removes the legacy Home marketing phrases", () => {
    const consumer = [
      source("app/page.tsx"),
      source("app/layout.tsx"),
      source("docs/i18n-ux-flow.md"),
    ].join("\n");
    for (const phrase of [
      "4만원짜리 실패는 그만",
      "너한테 맞는 최대 셋",
      "내 피부 결, 보러 가기",
      "솔직하게 골라드려요",
      "No more ₩40,000 mistakes",
      "Go see my skin texture",
    ]) {
      expect(consumer).not.toContain(phrase);
    }
  });
});
