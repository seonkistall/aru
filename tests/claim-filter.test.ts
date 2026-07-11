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

  it("passes neutral descriptive copy in every language", () => {
    expect(reasonClean("가볍게 마무리되는 젤 타입이에요.", "ko")).toBe(true);
    expect(reasonClean("A light gel texture that suits oily skin.", "en")).toBe(true);
    expect(reasonClean("さっぱりしたジェルタイプで、オイリーな肌質に合います。", "ja")).toBe(true);
    expect(reasonClean("清爽的凝胶质地，适合油性肤质。", "zh")).toBe(true);
  });
});
