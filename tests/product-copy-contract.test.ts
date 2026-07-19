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

  it("uses the approved Scan and Survey journey", () => {
    const consumer = [
      source("app/scan/page.tsx"),
      source("app/scan/use-quality-loop.ts"),
      source("app/survey/page.tsx"),
    ].join("\n");
    for (const phrase of [
      "오늘의 피부를 카메라로 살펴볼게요",
      "얼굴을 가이드에 맞추면 빛과 각도를 확인한 뒤 자동으로 촬영해요.",
      "30초 피부 체크, 시작해볼까요?",
      "카메라로 살펴보기",
      "카메라 없이 설문으로 시작하기",
      "좋아요. 잠시 그대로 있어주세요.",
      "피부가 선명하게 보이지 않았어요. 가이드라인에 맞춰서 밝은 곳에서 정면으로 다시 촬영해 주세요.",
      "설문으로 이어가기",
      "나에게 맞는 스킨케어를 찾아볼게요",
      "피부와 취향을 조금 더 알려주세요.",
      "사진에서 확인한 {signals} 항목을 먼저 선택했어요. 내 느낌과 다르면 바꿔주세요.",
      "평소 신경 쓰이는 고민을 골라주세요.",
      "제품 종류, 피부 타입, 예산을 선택해 주세요.",
      "내 스킨케어 결과 보기",
    ]) {
      expect(consumer).toContain(phrase);
    }
  });
});
