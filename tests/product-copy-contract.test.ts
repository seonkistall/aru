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

  it("uses the approved Report, product, routine, and Care journey", () => {
    const consumer = [
      source("app/report/page.tsx"),
      source("app/components/product-card.tsx"),
      source("app/components/product-compare.tsx"),
      source("app/care/page.tsx"),
      source("lib/care.ts"),
      source("lib/report-trust.ts"),
      source("lib/recommend.ts"),
    ].join("\n");
    for (const phrase of [
      "오늘의 피부 리포트",
      "카메라에서 확인한 피부 특징을 설문 답변과 함께 정리했어요.",
      "촬영 조건이 충족되지 않아 사진은 참고만 하고, 설문 답변을 중심으로 정리했어요.",
      "설문 답변을 바탕으로 나에게 맞는 스킨케어를 정리했어요.",
      "피부 타입 {type}, 고민 {concerns}, 예산 {budget}을 함께 고려했어요. 이 조건에 가까운 {category} 제품을 최대 세 개 보여드릴게요.",
      "카메라에서 확인한 {signals}도 함께 참고했어요.",
      "살펴볼 제품 후보",
      "예산대, 용량, 주요 성분을 비교해 보세요.",
      "현재 가격, 옵션, 전성분은 판매처에서 다시 확인해 주세요.",
      "{label}에서 제품 보기",
      "이 제품 사용 시작하기",
      "사용 시작일을 기록했어요.",
      "오늘부터 가볍게 시작할 루틴",
      "제품 정보나 전문가 상담이 더 궁금한가요?",
      "추천 제품의 판매처를 확인하거나, 피부 고민이 계속되면 상담 정보를 찾아볼 수 있어요.",
      "제품과 상담 정보 보기",
      "아직 이어서 볼 리포트가 없어요.",
      "먼저 피부를 살펴보거나 설문을 완료하면 제품 정보와 루틴을 이어서 볼 수 있어요.",
      "추천 제품 더 알아보기",
      "궁금한 제품의 정보와 판매처를 한눈에 비교해 보세요.",
      "피부 고민이 계속 신경 쓰인다면",
    ]) {
      expect(consumer).toContain(phrase);
    }

    for (const phrase of [
      "사진과 설문을 함께 읽었어요.",
      "스캔 신호를 추천에 반영했어요",
      "후속 연결",
      "구매/상담 연결",
      "이 제품을 사용하기 시작했어요",
      "사용 후 체크인으로 다음 추천을 더 정확하게 만들 수 있어요.",
    ]) {
      expect(consumer).not.toContain(phrase);
    }
  });

  it("uses the approved reminder, Check-in, Share, and Studio journey", () => {
    const reminder = source("app/components/reengage-optin.tsx");
    const checkin = source("app/checkin/page.tsx");
    const share = [
      source("app/components/share-card.tsx"),
      source("app/scan/page.tsx"),
      source("app/studio/page.tsx"),
    ].join("\n");
    const email = source("lib/reengage.ts");

    for (const phrase of [
      "2주 뒤, 루틴은 잘 맞는지 같이 확인해 볼까요?",
      "2주와 4주 뒤에 한 번씩 이메일로 가볍게 알려드릴게요. 원할 때 언제든 그만 받을 수 있어요.",
      "이메일로 알림 받기",
      "알림을 신청했어요. 2주 뒤에 잊지 않도록 알려드릴게요.",
    ]) {
      expect(reminder).toContain(phrase);
    }

    for (const phrase of [
      "스킨케어, 직접 써보니 어땠나요?",
      "짧게 사용감을 남겨두면 내 루틴을 돌아보기 좋아요.",
      "2주 정도 사용해 본 뒤에 다시 물어볼게요.",
      "남겨주신 피드백을 저장했어요.",
      "체크인을 모두 마쳤어요. 다음 스킨케어가 궁금할 때 다시 피부를 살펴보세요.",
      "오늘 피부 다시 살펴보기",
    ]) {
      expect(checkin).toContain(phrase);
    }

    for (const phrase of [
      "오늘의 피부 특징을 간단히 정리했어요.",
      "오늘의 피부 리포트 공유하기",
      "친구도 링크에서 30초 만에 자신의 피부를 살펴볼 수 있어요.",
      "공유할 문구 다듬기",
    ]) {
      expect(share).toContain(phrase);
    }

    for (const phrase of [
      "다음 추천이 더 정확해져요",
      "다음 스캔에 더 정확히 반영할게요",
      "Your feedback makes the next recommendation more accurate",
      "次回のおすすめがより正確になります",
      "下次推荐更准确",
    ]) {
      expect(`${checkin}\n${email}`).not.toContain(phrase);
    }
  });
});
