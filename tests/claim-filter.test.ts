import { describe, expect, it } from "vitest";
import { reasonClean } from "@/lib/claim-filter";

describe("multilingual banned-claims gate (reasonClean)", () => {
  it("keeps blocking Korean claims via efficacyClean regardless of lang", () => {
    expect(reasonClean("여드름 치료에 좋아요", "ko")).toBe(false);
    expect(reasonClean("미백 효과가 있어요", "en")).toBe(false);
  });

  it("blocks English verb inflections, not just base forms", () => {
    expect(reasonClean("Great for treating acne while staying light.", "en")).toBe(false);
    expect(reasonClean("Guarantees visible results in a week.", "en")).toBe(false);
    expect(reasonClean("Curing breakouts overnight.", "en")).toBe(false);
    expect(reasonClean("Erasing dark spots gently.", "en")).toBe(false);
    expect(reasonClean("Eliminating wrinkles fast.", "en")).toBe(false);
    expect(reasonClean("Removes acne scars and regenerates skin.", "en")).toBe(false);
    expect(reasonClean("Lifts and firms with anti aging power.", "en")).toBe(false);
    expect(reasonClean("Noticeably improves skin tone.", "en")).toBe(false);
  });

  it("blocks Japanese kanji and katakana loanword claim forms", () => {
    expect(reasonClean("肌の再生をサポートします。", "ja")).toBe(false);
    expect(reasonClean("ホワイトニングケアにぴったり。", "ja")).toBe(false);
    expect(reasonClean("アンチエイジングにおすすめ。", "ja")).toBe(false);
    expect(reasonClean("シミを除去します。", "ja")).toBe(false);
  });

  it("blocks Chinese efficacy claim forms", () => {
    expect(reasonClean("有抗衰老再生功能。", "zh")).toBe(false);
    expect(reasonClean("祛斑淡斑一步到位。", "zh")).toBe(false);
    expect(reasonClean("提拉紧致轮廓。", "zh")).toBe(false);
  });

  // The nine sentences that leaked on 2026-09-20, kept as the regression. Each names
  // the concept from the Korean BANNED list that lib/claim-filter.ts's header says it
  // mirrors and that the language had no equivalent for. They are ordinary LLM phrasing,
  // not adversarial strings: "a visible brightening effect" is what a model writes when
  // told to sell a product in one sentence.
  it("blocks the efficacy/effect family, which en, zh and ar had no word for", () => {
    expect(reasonClean("A gentle formula with a visible brightening effect.", "en")).toBe(false);
    expect(reasonClean("Proven efficacy on enlarged pores.", "en")).toBe(false);
    expect(reasonClean("对油性肌肤效果明显。", "zh")).toBe(false);
    expect(reasonClean("温和有效，适合日常使用。", "zh")).toBe(false);
    expect(reasonClean("فعالية عالية للبشرة الدهنية.", "ar")).toBe(false);
    expect(reasonClean("منتج فعال لتقليل اللمعان.", "ar")).toBe(false);
  });

  it("blocks Arabic improvement and treatment claims", () => {
    // ar had no entry for 개선 at all until 2026-09-20, and no Arabic case in this file.
    expect(reasonClean("يساعد على تحسين ملمس البشرة.", "ar")).toBe(false);
    expect(reasonClean("علاج مثالي لحب الشباب.", "ar")).toBe(false);
    expect(reasonClean("تبييض البشرة بلطف.", "ar")).toBe(false);
    expect(reasonClean("نتيجة مضمونة خلال أسبوع.", "ar")).toBe(false);
  });

  it("blocks dermatology framing, which the Korean list bans as 피부과", () => {
    expect(reasonClean("Dermatologist recommended for sensitive skin.", "en")).toBe(false);
    expect(reasonClean("皮肤科医生推荐。", "zh")).toBe(false);
    expect(reasonClean("皮膚科でも使われる処方です。", "ja")).toBe(false);
    expect(reasonClean("피부과에서도 쓰는 성분이에요", "ko")).toBe(false);
  });

  it("passes neutral descriptive copy in every language", () => {
    expect(reasonClean("가볍게 마무리되는 젤 타입이에요.", "ko")).toBe(true);
    expect(reasonClean("A light gel texture that suits oily skin.", "en")).toBe(true);
    expect(reasonClean("さっぱりしたジェルタイプで、オイリーな肌質に合います。", "ja")).toBe(true);
    expect(reasonClean("清爽的凝胶质地，适合油性肤质。", "zh")).toBe(true);
    expect(reasonClean("قوام جل خفيف يناسب البشرة الدهنية.", "ar")).toBe(true);
  });
});
